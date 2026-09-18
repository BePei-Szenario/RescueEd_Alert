import {DatabaseSync} from "node:sqlite";
import path from "node:path";

const file=process.env.DATABASE_PATH;
if(!file||!path.isAbsolute(file))throw new Error("DATABASE_PATH muss absolut sein.");
const db=new DatabaseSync(file);
try{
 db.exec("PRAGMA busy_timeout=5000");
 const before=Date.now()-30*86400000;
 const result=db.prepare("DELETE FROM app_crash_reports WHERE created_at < ?").run(before);
 process.stdout.write(`${result.changes} abgelaufene App-Fehlerberichte entfernt.\n`);
}finally{db.close()}
