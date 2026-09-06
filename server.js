const express = require("express");
const Database = require("better-sqlite3");
const QRCode = require("qrcode");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const BASE_URL =
    process.env.BASE_URL ||
    "https://convite-casamento-resh.onrender.com";

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD ||
    "CASAMENTO2026";

const ENTRY_PASSWORD =
    process.env.ENTRY_PASSWORD ||
    "ENTRADA2026";


/* =========================================
   BASE DE DADOS
========================================= */

const db =
    new Database("convites.db");


db.exec(`

CREATE TABLE IF NOT EXISTS convidados(

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    codigo TEXT UNIQUE NOT NULL,

    nome TEXT NOT NULL,

    pessoas INTEGER NOT NULL DEFAULT 1,

    estado TEXT NOT NULL DEFAULT 'Não utilizado',

    usado_em TEXT,

    criado_em TEXT DEFAULT CURRENT_TIMESTAMP

)

`);


/* =========================================
   CONVIDADO INICIAL
========================================= */

function seed(
    codigo,
    nome,
    pessoas
){

    if(

        !db
        .prepare(
            "SELECT codigo FROM convidados WHERE codigo=?"
        )
        .get(codigo)

    ){

        db
        .prepare(
            "INSERT INTO convidados(codigo,nome,pessoas) VALUES(?,?,?)"
        )
        .run(
            codigo,
            nome,
            pessoas
        );

    }

}


seed(
    "VL2026-001",
    "Valdemiro e Esposa",
    2
);


/* =========================================
   CONFIGURAÇÕES
========================================= */

app.use(
    express.json()
);


app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);


app.get(
    "/",
    (req,res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "convite.html"
            )
        );

    }
);


/* =========================================
   AUTENTICAÇÃO ADMINISTRADOR
========================================= */

function adminAuth(
    req,
    res,
    next
){

    const h =
        req.headers.authorization ||
        "";


    if(
        !h.startsWith("Basic ")
    ){

        return res
        .status(401)
        .json({

            erro:
            "Autenticação necessária"

        });

    }


    const dados =

        Buffer
        .from(
            h.slice(6),
            "base64"
        )
        .toString()
        .split(":");


    const password =
        dados[1];


    if(
        password !== ADMIN_PASSWORD
    ){

        return res
        .status(401)
        .json({

            erro:
            "Senha inválida"

        });

    }


    next();

}


/* =========================================
   AUTENTICAÇÃO RESPONSÁVEL ENTRADA
========================================= */

function entryAuth(
    req,
    res,
    next
){

    const h =
        req.headers.authorization ||
        "";


    if(
        !h.startsWith("Basic ")
    ){

        return res
        .status(401)
        .json({

            erro:
            "Autenticação necessária"

        });

    }


    const dados =

        Buffer
        .from(
            h.slice(6),
            "base64"
        )
        .toString()
        .split(":");


    const password =
        dados[1];


    if(
        password !== ENTRY_PASSWORD
    ){

        return res
        .status(401)
        .json({

            erro:
            "Senha inválida"

        });

    }


    next();

}


/* =========================================
   CONSULTAR CONVITE
========================================= */

app.get(
    "/api/convite/:codigo",

    (req,res) => {

        const x =

            db
            .prepare(

                `
                SELECT
                    codigo,
                    nome,
                    pessoas,
                    estado,
                    usado_em

                FROM convidados

                WHERE codigo=?
                `

            )
            .get(
                req.params.codigo
            );


        if(!x){

            return res
            .status(404)
            .json({

                erro:
                "Convite inválido"

            });

        }


        res.json(x);

    }
);


/* =========================================
   GERAR QR CODE
========================================= */

app.get(
    "/qr/:codigo",

    async(req,res) => {

        const x =

            db
            .prepare(

                "SELECT codigo FROM convidados WHERE codigo=?"

            )
            .get(
                req.params.codigo
            );


        if(!x){

            return res
            .status(404)
            .send(
                "Não encontrado"
            );

        }


        const url =

            `${BASE_URL}/convite.html?codigo=${
                encodeURIComponent(
                    req.params.codigo
                )
            }`;


        const qr =

            await QRCode
            .toBuffer(

                url,

                {

                    width:700,

                    margin:2,

                    errorCorrectionLevel:"H"

                }

            );


        res
        .type("png")
        .send(qr);

    }
);


/* =========================================
   TESTE ADMIN
========================================= */

app.get(
    "/api/admin/test",

    adminAuth,

    (req,res) => {

        res.json({

            ok:true

        });

    }
);


/* =========================================
   TESTE ENTRADA
========================================= */

app.get(
    "/api/entrada/test",

    entryAuth,

    (req,res) => {

        res.json({

            ok:true

        });

    }
);


/* =========================================
   RESUMO ADMINISTRATIVO
========================================= */

app.get(
    "/api/admin/resumo",

    adminAuth,

    (req,res) => {

        const totalConvites =

            db
            .prepare(
                "SELECT COUNT(*) AS n FROM convidados"
            )
            .get()
            .n;


        const pessoasAutorizadas =

            db
            .prepare(
                "SELECT COALESCE(SUM(pessoas),0) AS n FROM convidados"
            )
            .get()
            .n;


        const convitesUtilizados =

            db
            .prepare(

                `
                SELECT COUNT(*) AS n
                FROM convidados
                WHERE estado='Utilizado'
                `

            )
            .get()
            .n;


        const pessoasEntraram =

            db
            .prepare(

                `
                SELECT COALESCE(SUM(pessoas),0) AS n
                FROM convidados
                WHERE estado='Utilizado'
                `

            )
            .get()
            .n;


        const convitesPendentes =
            totalConvites -
            convitesUtilizados;


        const pessoasPendentes =
            pessoasAutorizadas -
            pessoasEntraram;


        res.json({

            total_convites:
                totalConvites,

            pessoas_autorizadas:
                pessoasAutorizadas,

            convites_utilizados:
                convitesUtilizados,

            pessoas_entraram:
                pessoasEntraram,

            convites_pendentes:
                convitesPendentes,

            pessoas_pendentes:
                pessoasPendentes

        });

    }
);


/* =========================================
   LISTAR CONVIDADOS
========================================= */

app.get(
    "/api/admin/convidados",

    adminAuth,

    (req,res) => {

        const q =
            (req.query.q || "")
            .trim();


        const estado =
            (req.query.estado || "")
            .trim();


        let sql =
            "SELECT * FROM convidados";


        const params = [];


        const filtros = [];


        if(q){

            filtros.push(

                "(codigo LIKE ? OR nome LIKE ?)"

            );


            params.push(
                `%${q}%`
            );


            params.push(
                `%${q}%`
            );

        }


        if(estado){

            if(
                estado === "Pendente"
            ){

                filtros.push(
                    "estado='Não utilizado'"
                );

            }

            else if(
                estado === "Utilizado"
            ){

                filtros.push(
                    "estado='Utilizado'"
                );

            }

        }


        if(
            filtros.length
        ){

            sql +=
                " WHERE " +
                filtros.join(" AND ");

        }


        sql +=
            " ORDER BY id DESC";


        const convidados =

            db
            .prepare(sql)
            .all(...params);


        res.json(
            convidados
        );

    }
);


/* =========================================
   ADICIONAR CONVIDADO
========================================= */

app.post(
    "/api/admin/convidados",

    adminAuth,

    (req,res) => {

        let {
            codigo,
            nome,
            pessoas
        } = req.body;


        codigo =
            (codigo || "")
            .trim()
            .toUpperCase();


        nome =
            (nome || "")
            .trim();


        pessoas =
            Number(
                pessoas || 1
            );


        if(

            !codigo ||

            !nome ||

            pessoas < 1

        ){

            return res
            .status(400)
            .json({

                erro:
                "Preencha código, nome e número de pessoas."

            });

        }


        try{

            db
            .prepare(

                `
                INSERT INTO convidados(
                    codigo,
                    nome,
                    pessoas
                )

                VALUES(?,?,?)
                `

            )
            .run(
                codigo,
                nome,
                pessoas
            );


            res.json({

                ok:true

            });

        }

        catch(e){

            res
            .status(400)
            .json({

                erro:
                "Este código já existe."

            });

        }

    }
);


/* =========================================
   EDITAR CONVIDADO
========================================= */

app.put(
    "/api/admin/convidados/:codigo",

    adminAuth,

    (req,res) => {

        const {
            nome,
            pessoas
        } = req.body;


        const r =

            db
            .prepare(

                `
                UPDATE convidados

                SET
                    nome=?,
                    pessoas=?

                WHERE codigo=?
                `

            )
            .run(

                (nome || "").trim(),

                Number(pessoas),

                req.params.codigo

            );


        if(
            !r.changes
        ){

            return res
            .status(404)
            .json({

                erro:
                "Não encontrado"

            });

        }


        res.json({

            ok:true

        });

    }
);


/* =========================================
   ELIMINAR CONVIDADO
========================================= */

app.delete(
    "/api/admin/convidados/:codigo",

    adminAuth,

    (req,res) => {

        const r =

            db
            .prepare(

                "DELETE FROM convidados WHERE codigo=?"

            )
            .run(
                req.params.codigo
            );


        if(
            !r.changes
        ){

            return res
            .status(404)
            .json({

                erro:
                "Não encontrado"

            });

        }


        res.json({

            ok:true

        });

    }
);


/* =========================================
   CONSULTAR CONVITE PARA ENTRADA
========================================= */

app.get(
    "/api/entrada/consultar/:codigo",

    entryAuth,

    (req,res) => {

        const codigo =

            req.params.codigo
            .trim()
            .toUpperCase();


        const x =

            db
            .prepare(

                `
                SELECT
                    codigo,
                    nome,
                    pessoas,
                    estado,
                    usado_em

                FROM convidados

                WHERE codigo=?
                `

            )
            .get(codigo);


        if(!x){

            return res
            .status(404)
            .json({

                erro:
                "Convite não encontrado."

            });

        }


        res.json(x);

    }
);


/* =========================================
   CONFIRMAR ENTRADA
========================================= */

app.post(
    "/api/entrada/confirmar/:codigo",

    entryAuth,

    (req,res) => {

        const codigo =

            req.params.codigo
            .trim()
            .toUpperCase();


        const x =

            db
            .prepare(

                `
                SELECT *
                FROM convidados
                WHERE codigo=?
                `

            )
            .get(codigo);


        if(!x){

            return res
            .status(404)
            .json({

                erro:
                "Convite não encontrado."

            });

        }


        if(
            x.estado === "Utilizado"
        ){

            return res
            .status(409)
            .json({

                erro:
                "Este convite já foi utilizado.",

                convidado:x

            });

        }


        const agora =

            new Date()
            .toLocaleString(

                "pt-PT",

                {

                    dateStyle:"short",

                    timeStyle:"short"

                }

            );


        db
        .prepare(

            `
            UPDATE convidados

            SET
                estado='Utilizado',
                usado_em=?

            WHERE codigo=?
            `

        )
        .run(
            agora,
            codigo
        );


        res.json({

            ok:true,

            mensagem:
                "Entrada confirmada com sucesso.",

            convidado:{

                ...x,

                estado:
                    "Utilizado",

                usado_em:
                    agora

            }

        });

    }
);


/* =========================================
   REPOR CONVITE
========================================= */

app.post(
    "/api/admin/repor/:codigo",

    adminAuth,

    (req,res) => {

        const r =

            db
            .prepare(

                `
                UPDATE convidados

                SET

                    estado='Não utilizado',

                    usado_em=NULL

                WHERE codigo=?
                `

            )
            .run(
                req.params.codigo
            );


        if(
            !r.changes
        ){

            return res
            .status(404)
            .json({

                erro:
                "Não encontrado"

            });

        }


        res.json({

            ok:true

        });

    }
);


/* =========================================
   EXPORTAR CSV
========================================= */

app.get(
    "/api/admin/exportar/csv",

    adminAuth,

    (req,res) => {

        const convidados =

            db
            .prepare(

                `
                SELECT
                    codigo,
                    nome,
                    pessoas,
                    estado,
                    usado_em

                FROM convidados

                ORDER BY id DESC
                `

            )
            .all();


        let csv =

            "Código,Nome,Pessoas,Estado,Data/Hora Entrada\n";


        convidados.forEach(
            x => {

                const nome =

                    `"${x.nome.replace(/"/g,'""')}"`;


                csv +=

                    `${x.codigo},` +

                    `${nome},` +

                    `${x.pessoas},` +

                    `${x.estado},` +

                    `"${x.usado_em || ""}"\n`;

            }
        );


        res.setHeader(

            "Content-Type",

            "text/csv; charset=utf-8"

        );


        res.setHeader(

            "Content-Disposition",

            'attachment; filename="lista-convidados.csv"'

        );


        res.send(
            "\uFEFF" + csv
        );

    }
);


/* =========================================
   EXPORTAR EXCEL
========================================= */

app.get(
    "/api/admin/exportar/excel",

    adminAuth,

    (req,res) => {

        const convidados =

            db
            .prepare(

                `
                SELECT
                    codigo,
                    nome,
                    pessoas,
                    estado,
                    usado_em

                FROM convidados

                ORDER BY id DESC
                `

            )
            .all();


        let html = `

            <table>

                <tr>

                    <th>Código</th>

                    <th>Nome</th>

                    <th>Pessoas</th>

                    <th>Estado</th>

                    <th>Data/Hora Entrada</th>

                </tr>

        `;


        convidados.forEach(
            x => {

                html += `

                    <tr>

                        <td>${x.codigo}</td>

                        <td>${x.nome}</td>

                        <td>${x.pessoas}</td>

                        <td>${x.estado}</td>

                        <td>${x.usado_em || ""}</td>

                    </tr>

                `;

            }
        );


        html +=
            "</table>";


        res.setHeader(

            "Content-Type",

            "application/vnd.ms-excel"

        );


        res.setHeader(

            "Content-Disposition",

            'attachment; filename="lista-convidados.xls"'

        );


        res.send(html);

    }
);


/* =========================================
   INICIAR SERVIDOR
========================================= */

app.listen(

    PORT,

    () => {

        console.log(
            "Sistema: " +
            BASE_URL
        );

    }

);
