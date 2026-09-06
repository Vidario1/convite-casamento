const express=require("express");
const Database=require("better-sqlite3");
const QRCode=require("qrcode");
const path=require("path");

const app=express();
const PORT=process.env.PORT||3000;
const BASE_URL=process.env.BASE_URL||`http://localhost:${PORT}`;
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"CASAMENTO2026";

const db=new Database("convites.db");
db.exec(`CREATE TABLE IF NOT EXISTS convidados(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 codigo TEXT UNIQUE NOT NULL,
 nome TEXT NOT NULL,
 pessoas INTEGER NOT NULL DEFAULT 1,
 estado TEXT NOT NULL DEFAULT 'Não utilizado',
 usado_em TEXT,
 criado_em TEXT DEFAULT CURRENT_TIMESTAMP
)`);

function seed(codigo,nome,pessoas){
 if(!db.prepare("SELECT codigo FROM convidados WHERE codigo=?").get(codigo))
 db.prepare("INSERT INTO convidados(codigo,nome,pessoas) VALUES(?,?,?)").run(codigo,nome,pessoas);
}
seed("VL2026-001","Valdemiro e Esposa",2);

app.use(express.json());
app.use(express.static(path.join(__dirname,"public")));
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "convite.html"));
});

function auth(req,res,next){
 const h=req.headers.authorization||"";
 if(!h.startsWith("Basic ")) {res.set("WWW-Authenticate",'Basic realm="Organização"'); return res.status(401).json({erro:"Autenticação necessária"});}
 const [,p]=Buffer.from(h.slice(6),"base64").toString().split(":");
 if(p!==ADMIN_PASSWORD) return res.status(401).json({erro:"Senha inválida"});
 next();
}

app.get("/api/convite/:codigo",(req,res)=>{
 const x=db.prepare("SELECT codigo,nome,pessoas,estado,usado_em FROM convidados WHERE codigo=?").get(req.params.codigo);
 if(!x)return res.status(404).json({erro:"Convite inválido"});
 res.json(x);
});
app.get("/qr/:codigo",async(req,res)=>{
 const x=db.prepare("SELECT codigo FROM convidados WHERE codigo=?").get(req.params.codigo);
 if(!x)return res.status(404).send("Não encontrado");
 const url=`${BASE_URL}/convite.html?codigo=${encodeURIComponent(req.params.codigo)}`;
 res.type("png").send(await QRCode.toBuffer(url,{width:700,margin:2,errorCorrectionLevel:"H"}));
});

app.get("/api/admin/test",auth,(req,res)=>res.json({ok:true}));
app.get("/api/admin/resumo",auth,(req,res)=>{
 const total=db.prepare("SELECT COUNT(*) n FROM convidados").get().n;
 const usados=db.prepare("SELECT COUNT(*) n FROM convidados WHERE estado='Utilizado'").get().n;
 res.json({total,usados,nao_utilizados:total-usados});
});
app.get("/api/admin/convidados",auth,(req,res)=>{
 res.json(db.prepare("SELECT * FROM convidados ORDER BY id DESC").all());
});
app.post("/api/admin/convidados",auth,(req,res)=>{
 let {codigo,nome,pessoas}=req.body;
 codigo=(codigo||"").trim().toUpperCase(); nome=(nome||"").trim(); pessoas=Number(pessoas||1);
 if(!codigo||!nome||pessoas<1)return res.status(400).json({erro:"Preencha código, nome e número de pessoas."});
 try{
  db.prepare("INSERT INTO convidados(codigo,nome,pessoas) VALUES(?,?,?)").run(codigo,nome,pessoas);
  res.json({ok:true});
 }catch(e){res.status(400).json({erro:"Este código já existe."});}
});
app.put("/api/admin/convidados/:codigo",auth,(req,res)=>{
 const {nome,pessoas}=req.body;
 const r=db.prepare("UPDATE convidados SET nome=?,pessoas=? WHERE codigo=?").run((nome||"").trim(),Number(pessoas),req.params.codigo);
 if(!r.changes)return res.status(404).json({erro:"Não encontrado"});
 res.json({ok:true});
});
app.delete("/api/admin/convidados/:codigo",auth,(req,res)=>{
 const r=db.prepare("DELETE FROM convidados WHERE codigo=?").run(req.params.codigo);
 if(!r.changes)return res.status(404).json({erro:"Não encontrado"});
 res.json({ok:true});
});
app.post("/api/admin/checkin/:codigo",auth,(req,res)=>{
 const x=db.prepare("SELECT * FROM convidados WHERE codigo=?").get(req.params.codigo);
 if(!x)return res.status(404).json({erro:"Convite inválido"});
 if(x.estado==="Utilizado")return res.status(409).json({erro:"Este convite já foi utilizado.",convidado:x});
 const agora=new Date().toLocaleString("pt-PT",{dateStyle:"short",timeStyle:"short"});
 db.prepare("UPDATE convidados SET estado='Utilizado',usado_em=? WHERE codigo=?").run(agora,req.params.codigo);
 res.json({ok:true,mensagem:"Entrada confirmada.",convidado:{...x,estado:"Utilizado",usado_em:agora}});
});
app.post("/api/admin/repor/:codigo",auth,(req,res)=>{
 db.prepare("UPDATE convidados SET estado='Não utilizado',usado_em=NULL WHERE codigo=?").run(req.params.codigo);
 res.json({ok:true});
});

app.listen(PORT,()=>console.log("Sistema: "+BASE_URL));
