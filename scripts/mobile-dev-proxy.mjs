import net from "node:net";

const listenPort=Number(process.env.RESCUEED_MOBILE_PROXY_PORT||5174);
const targetPort=Number(process.env.RESCUEED_DEV_SERVER_PORT||5173);

const server=net.createServer(client=>{
 const upstream=net.connect({host:"::1",port:targetPort});
 client.pipe(upstream);upstream.pipe(client);
 const close=()=>{client.destroy();upstream.destroy()};
 client.on("error",close);upstream.on("error",close);
});

server.listen(listenPort,"127.0.0.1",()=>{
 console.log(`RescueEd mobile proxy: 127.0.0.1:${listenPort} -> [::1]:${targetPort}`);
});
