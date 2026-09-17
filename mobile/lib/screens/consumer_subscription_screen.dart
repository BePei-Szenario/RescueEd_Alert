import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import '../api.dart';

const googleSubscriptionId=String.fromEnvironment('GOOGLE_SUBSCRIPTION_ID');
const appleSubscriptionId=String.fromEnvironment('APPLE_SUBSCRIPTION_ID');

class ConsumerSubscriptionScreen extends StatefulWidget {
  const ConsumerSubscriptionScreen({super.key,required this.api,required this.userId,required this.onActive});
  final ApiClient api;
  final String userId;
  final VoidCallback onActive;
  @override
  State<ConsumerSubscriptionScreen> createState()=>_ConsumerSubscriptionScreenState();
}

class _ConsumerSubscriptionScreenState extends State<ConsumerSubscriptionScreen>{
  final store=InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? purchases;
  ProductDetails? product;
  bool loading=true,busy=false,active=false;
  String? error;
  String get productId=>Platform.isIOS?appleSubscriptionId:googleSubscriptionId;
  String get storeName=>Platform.isIOS?'apple':'google';

  @override
  void initState(){super.initState();purchases=store.purchaseStream.listen(_onPurchases,onError:(Object e){if(mounted)setState(()=>error=e.toString());});_load();}
  @override
  void dispose(){purchases?.cancel();super.dispose();}

  Future<void> _load()async{
    try{
      final status=await widget.api.get('/api/mobile/consumer/subscription');
      if(status['active']==true){if(mounted)setState(()=>active=true);widget.onActive();return;}
      if(productId.isEmpty)throw StateError('Das Monatsabo ist im Store noch nicht eingerichtet. Bitte später erneut versuchen.');
      if(!await store.isAvailable())throw StateError('Der App Store ist auf diesem Gerät nicht erreichbar.');
      final products=await store.queryProductDetails({productId});
      if(products.error!=null)throw StateError(products.error!.message);
      if(products.productDetails.length!=1)throw StateError('Das Monatsabo wurde im Store noch nicht gefunden.');
      product=products.productDetails.single;
    }catch(e){error=e.toString();}
    if(mounted)setState(()=>loading=false);
  }

  Future<void> _onPurchases(List<PurchaseDetails> updates)async{
    for(final purchase in updates){
      if(purchase.productID!=productId)continue;
      if(purchase.status==PurchaseStatus.pending){if(mounted)setState(()=>busy=true);continue;}
      if(purchase.status==PurchaseStatus.error){if(mounted)setState((){busy=false;error=purchase.error?.message??'Kauf fehlgeschlagen.';});continue;}
      if(purchase.status==PurchaseStatus.canceled){if(mounted)setState(()=>busy=false);continue;}
      if(purchase.status!=PurchaseStatus.purchased&&purchase.status!=PurchaseStatus.restored)continue;
      try{
        final reference=Platform.isIOS?purchase.purchaseID:purchase.verificationData.serverVerificationData;
        if(reference==null||reference.isEmpty)throw StateError('Store-Kaufreferenz fehlt.');
        final result=await widget.api.post('/api/mobile/consumer/subscription',{'store':storeName,'reference':reference});
        if(result['active']!=true)throw StateError('Der Store hat noch kein aktives Abo bestätigt. Bitte nach Zahlungsabschluss erneut versuchen.');
        if(purchase.pendingCompletePurchase)await store.completePurchase(purchase);
        if(mounted)setState((){active=true;busy=false;error=null;});
        widget.onActive();
      }catch(e){if(mounted)setState((){busy=false;error=e.toString();});}
    }
  }

  Future<void> _buy()async{
    if(product==null)return;
    setState((){busy=true;error=null;});
    try{await store.buyNonConsumable(purchaseParam:PurchaseParam(productDetails:product!,applicationUserName:widget.userId));}
    catch(e){if(mounted)setState((){busy=false;error=e.toString();});}
  }

  Future<void> _showLegal() async {
    try {
      final response=await widget.api.get('/api/mobile/consumer/register');
      final documents=response['documents'] as List;
      if(!mounted)return;
      await showDialog<void>(context:context,builder:(dialogContext)=>AlertDialog(
        title:const Text('Rechtstexte zum App-Abo'),
        content:SizedBox(width:520,height:420,child:ListView(children:documents.map((raw){
          final document=Map<String,dynamic>.from(raw as Map);
          return ExpansionTile(title:Text('${document['title']} · ${document['version']}'),children:[Padding(padding:const EdgeInsets.all(12),child:SelectableText(document['content'] as String))]);
        }).toList())),
        actions:[FilledButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('OK'))],
      ));
    }catch(e){if(mounted)setState(()=>error=e.toString());}
  }

  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Monatsabo')),
    body:ListView(padding:const EdgeInsets.all(20),children:[
      const Icon(Icons.verified_user_outlined,size:56,color:Color(0xff146ee8)),const SizedBox(height:14),
      Text('RescueEd Alert für Privatpersonen',style:Theme.of(context).textTheme.headlineSmall,textAlign:TextAlign.center),const SizedBox(height:14),
      const Text('Mit einem aktiven Abo kannst du in der App beliebig viele neue Events anlegen. Läuft das Abo aus, bleiben bereits gestartete Events nutzbar; neue Events sind gesperrt.',textAlign:TextAlign.center),
      const SizedBox(height:20),
      if(loading)const Center(child:CircularProgressIndicator()),
      if(product!=null)...[
        Card(child:Padding(padding:const EdgeInsets.all(20),child:Column(children:[Text(product!.title,style:Theme.of(context).textTheme.titleLarge),const SizedBox(height:8),Text('${product!.price} pro Monat',style:Theme.of(context).textTheme.headlineSmall),const SizedBox(height:8),const Text('Der im Store angezeigte Preis ist maßgeblich.')]))),
        const SizedBox(height:18),FilledButton(onPressed:busy?_none:_buy,child:Text(busy?'Store wird geprüft …':'Monatsabo im Store abschließen')),
        TextButton(onPressed:busy?_none:()=>store.restorePurchases(applicationUserName:widget.userId),child:const Text('Kauf wiederherstellen')),
      ],
      if(active)const Text('Abo aktiv – neue Events können angelegt werden.',textAlign:TextAlign.center),
      if(error!=null)Padding(padding:const EdgeInsets.only(top:12),child:Text(error!,style:const TextStyle(color:Colors.red))),
      const SizedBox(height:18),TextButton(onPressed:_showLegal,child:const Text('AGB, Datenschutz und Widerrufsbelehrung ansehen')),
      const Text('Abrechnung und Verwaltung des Abos erfolgen über Google Play beziehungsweise den App Store.',textAlign:TextAlign.center),
    ]),
  );
}

void _none(){}
