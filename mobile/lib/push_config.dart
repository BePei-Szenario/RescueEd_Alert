import 'dart:io';
import 'package:firebase_core/firebase_core.dart';

const firebaseProjectId = String.fromEnvironment(
  'RESCUEED_FIREBASE_PROJECT_ID',
);
const firebaseSenderId = String.fromEnvironment('RESCUEED_FIREBASE_SENDER_ID');
const firebaseApiKey = String.fromEnvironment('RESCUEED_FIREBASE_API_KEY');
const firebaseAndroidAppId = String.fromEnvironment(
  'RESCUEED_FIREBASE_ANDROID_APP_ID',
);
const firebaseIosAppId = String.fromEnvironment('RESCUEED_FIREBASE_IOS_APP_ID');
const firebaseIosBundleId = String.fromEnvironment(
  'RESCUEED_FIREBASE_IOS_BUNDLE_ID',
  defaultValue: 'de.rescueed.alert',
);

bool get firebaseBuildOptionsConfigured =>
    firebaseProjectId.isNotEmpty &&
    firebaseSenderId.isNotEmpty &&
    firebaseApiKey.isNotEmpty &&
    (Platform.isAndroid
        ? firebaseAndroidAppId.isNotEmpty
        : firebaseIosAppId.isNotEmpty);

FirebaseOptions get firebaseBuildOptions => FirebaseOptions(
  apiKey: firebaseApiKey,
  appId: Platform.isAndroid ? firebaseAndroidAppId : firebaseIosAppId,
  messagingSenderId: firebaseSenderId,
  projectId: firebaseProjectId,
  iosBundleId: Platform.isIOS ? firebaseIosBundleId : null,
);

Future<bool> initializeRescueEdFirebase() async {
  if (Firebase.apps.isNotEmpty) return true;
  try {
    if (firebaseBuildOptionsConfigured) {
      await Firebase.initializeApp(options: firebaseBuildOptions);
    } else {
      // Production builds use google-services.json on Android and
      // GoogleService-Info.plist on iOS. Build defines remain available as a
      // controlled fallback for CI or isolated test builds.
      await Firebase.initializeApp();
    }
    return true;
  } catch (_) {
    return false;
  }
}
