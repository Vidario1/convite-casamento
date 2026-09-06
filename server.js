const express = require("express");
const Database = require("better-sqlite3");
const QRCode = require("qrcode");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const BASE_URL =
    process.env.BASE_URL ||
    "https://convite-casamento-resh.onrender.com";


// ============================================
// SENHAS
// ============================================

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD ||
    "CASAMENTO2026";


const ENTRADA_PASSWORD =
    process.env.ENTRADA_PASSWORD ||
    "ENTRADA2026";


// ============================================
// BASE DE DADOS
// ============================================

const dbPath = path.join(__dirname, "convites.db");

console.log("Base de dados:", dbPath);

const db = new Database(dbPath);


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


// ============================================
// CONVIDADO INICIAL
// ============================================

function seed(codigo, nome, pessoas) {

    const existe = db
        .prepare("SELECT codigo FROM convidados WHERE codigo = ?")
        .get(codigo);


    if (!existe) {

        db
            .prepare(`
                INSERT INTO convidados
                (codigo, nome, pessoas)
                VALUES (?, ?, ?)
            `)
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


// ============================================
// CONFIGURAÇÃO
// ============================================

app.use(express.json());

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


// ============================================
// PÁGINA INICIAL
// ============================================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "convite.html"
        )
    );

});


// ============================================
// AUTENTICAÇÃO ADMIN
// ============================================

function authAdmin(req, res, next) {

    const h =
        req.headers.authorization || "";


    if (!h.startsWith("Basic ")) {

        res.set(
            "WWW-Authenticate",
            'Basic realm="Organização"'
        );

        return res
            .status(401)
            .json({
                erro: "Autenticação necessária."
            });

    }


    const dados =
        Buffer
            .from(
                h.slice(6),
                "base64"
            )
            .toString();


    const partes =
        dados.split(":");


    const password =
        partes.slice(1).join(":");


    if (password !== ADMIN_PASSWORD) {

        return res
            .status(401)
            .json({
                erro: "Senha inválida."
            });

    }


    next();

}


// ============================================
// AUTENTICAÇÃO ENTRADA
// ============================================

function authEntrada(req, res, next) {

    const h =
        req.headers.authorization || "";


    if (!h.startsWith("Basic ")) {

        return res
            .status(401)
            .json({
                erro: "Autenticação necessária."
            });

    }


    const dados =
        Buffer
            .from(
                h.slice(6),
                "base64"
            )
            .toString();


    const partes =
        dados.split(":");


    const password =
        partes.slice(1).join(":");


    if (password !== ENTRADA_PASSWORD) {

        return res
            .status(401)
            .json({
                erro: "Senha inválida."
            });

    }


    next();

}


// ============================================
// CONSULTA PÚBLICA DO CONVITE
// ============================================

app.get(
    "/api/convite/:codigo",

    (req, res) => {

        const codigo =
            req.params.codigo
                .trim()
                .toUpperCase();


        const convidado =
            db
                .prepare(`
                    SELECT
                        codigo,
                        nome,
                        pessoas,
                        estado,
                        usado_em
                    FROM convidados
                    WHERE codigo = ?
                `)
                .get(codigo);


        if (!convidado) {

            return res
                .status(404)
                .json({
                    erro: "Convite inválido."
                });

        }


        res.json(convidado);

    }
);


// ============================================
// GERAR QR CODE
// ============================================

app.get(
    "/qr/:codigo",

    async (req, res) => {

        try {

            const codigo =
                req.params.codigo
                    .trim()
                    .toUpperCase();


            const convidado =
                db
                    .prepare(
                        "SELECT codigo FROM convidados WHERE codigo = ?"
                    )
                    .get(codigo);


            if (!convidado) {

                return res
                    .status(404)
                    .send("Convite não encontrado.");

            }


            const url =
                `${BASE_URL}/convite.html?codigo=${encodeURIComponent(codigo)}`;


            const qr =
                await QRCode.toBuffer(
                    url,
                    {
                        width: 700,
                        margin: 2,
                        errorCorrectionLevel: "H"
                    }
                );


            res
                .type("png")
                .send(qr);

        }

        catch (erro) {

            console.error(
                "Erro ao gerar QR:",
                erro
            );

            res
                .status(500)
                .send("Erro ao gerar QR Code.");

        }

    }
);


// ============================================
// CONTROLO DE ENTRADA
// ============================================


// TESTAR LOGIN

app.get(
    "/api/entrada/test",

    authEntrada,

    (req, res) => {

        res.json({
            ok: true
        });

    }
);


// CONSULTAR CONVIDADO

app.get(
    "/api/entrada/consultar/:codigo",

    authEntrada,

    (req, res) => {

        const codigo =
            req.params.codigo
                .trim()
                .toUpperCase();


        console.log(
            "Consulta entrada:",
            codigo
        );


        const convidado =
            db
                .prepare(`
                    SELECT
                        codigo,
                        nome,
                        pessoas,
                        estado,
                        usado_em
                    FROM convidados
                    WHERE UPPER(TRIM(codigo)) = ?
                `)
                .get(codigo);


        if (!convidado) {

            console.log(
                "Convite não encontrado:",
                codigo
            );


            return res
                .status(404)
                .json({
                    erro: "Convite não encontrado."
                });

        }


        console.log(
            "Convite encontrado:",
            convidado.codigo
        );


        res.json(convidado);

    }
);


// CONFIRMAR ENTRADA

app.post(
    "/api/entrada/confirmar/:codigo",

    authEntrada,

    (req, res) => {

        const codigo =
            req.params.codigo
                .trim()
                .toUpperCase();


        const convidado =
            db
                .prepare(`
                    SELECT *
                    FROM convidados
                    WHERE UPPER(TRIM(codigo)) = ?
                `)
                .get(codigo);


        if (!convidado) {

            return res
                .status(404)
                .json({
                    erro: "Convite inválido."
                });

        }


        if (
            convidado.estado === "Utilizado"
        ) {

            return res
                .status(409)
                .json({
                    erro:
                        "Este convite já foi utilizado.",

                    convidado:
                        convidado
                });

        }


        const agora =
            new Date()
                .toLocaleString(
                    "pt-PT",
                    {
                        dateStyle: "short",
                        timeStyle: "short"
                    }
                );


        db
            .prepare(`
                UPDATE convidados

                SET
                    estado = 'Utilizado',
                    usado_em = ?

                WHERE codigo = ?
            `)
            .run(
                agora,
                convidado.codigo
            );


        const atualizado =
            db
                .prepare(`
                    SELECT *
                    FROM convidados
                    WHERE codigo = ?
                `)
                .get(
                    convidado.codigo
                );


        res.json({

            ok: true,

            mensagem:
                "Entrada confirmada com sucesso.",

            convidado:
                atualizado

        });

    }
);


// ============================================
// PAINEL ADMIN
// ============================================


// TESTAR LOGIN

app.get(
    "/api/admin/test",

    authAdmin,

    (req, res) => {

        res.json({
            ok: true
        });

    }
);


// RESUMO

app.get(
    "/api/admin/resumo",

    authAdmin,

    (req, res) => {

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
                    "SELECT COALESCE(SUM(pessoas), 0) AS n FROM convidados"
                )
                .get()
                .n;


        const convitesUtilizados =
            db
                .prepare(`
                    SELECT COUNT(*) AS n
                    FROM convidados
                    WHERE estado = 'Utilizado'
                `)
                .get()
                .n;


        const pessoasEntraram =
            db
                .prepare(`
                    SELECT COALESCE(SUM(pessoas), 0) AS n
                    FROM convidados
                    WHERE estado = 'Utilizado'
                `)
                .get()
                .n;


        const convitesPendentes =
            totalConvites -
            convitesUtilizados;


        const pessoasPendentes =
            pessoasAutorizadas -
            pessoasEntraram;


        res.json({

            total:
                totalConvites,

            pessoas_autorizadas:
                pessoasAutorizadas,

            usados:
                convitesUtilizados,

            pessoas_entraram:
                pessoasEntraram,

            nao_utilizados:
                convitesPendentes,

            pessoas_pendentes:
                pessoasPendentes

        });

    }
);


// LISTAR CONVIDADOS

app.get(
    "/api/admin/convidados",

    authAdmin,

    (req, res) => {

        const convidados =
            db
                .prepare(`
                    SELECT *
                    FROM convidados
                    ORDER BY id DESC
                `)
                .all();


        res.json(convidados);

    }
);


// ADICIONAR CONVIDADO

app.post(
    "/api/admin/convidados",

    authAdmin,

    (req, res) => {

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
            Number(pessoas || 1);


        if (
            !codigo ||
            !nome ||
            pessoas < 1
        ) {

            return res
                .status(400)
                .json({
                    erro:
                        "Preencha código, nome e número de pessoas."
                });

        }


        try {

            db
                .prepare(`
                    INSERT INTO convidados
                    (
                        codigo,
                        nome,
                        pessoas
                    )
                    VALUES (?, ?, ?)
                `)
                .run(
                    codigo,
                    nome,
                    pessoas
                );


            res.json({
                ok: true
            });

        }

        catch (erro) {

            res
                .status(400)
                .json({
                    erro:
                        "Este código já existe."
                });

        }

    }
);


// EDITAR CONVIDADO

app.put(
    "/api/admin/convidados/:codigo",

    authAdmin,

    (req, res) => {

        let {
            nome,
            pessoas
        } = req.body;


        nome =
            (nome || "")
                .trim();


        pessoas =
            Number(pessoas);


        if (
            !nome ||
            pessoas < 1
        ) {

            return res
                .status(400)
                .json({
                    erro:
                        "Dados inválidos."
                });

        }


        const r =
            db
                .prepare(`
                    UPDATE convidados

                    SET
                        nome = ?,
                        pessoas = ?

                    WHERE codigo = ?
                `)
                .run(
                    nome,
                    pessoas,
                    req.params.codigo
                );


        if (!r.changes) {

            return res
                .status(404)
                .json({
                    erro:
                        "Convidado não encontrado."
                });

        }


        res.json({
            ok: true
        });

    }
);


// ELIMINAR CONVIDADO

app.delete(
    "/api/admin/convidados/:codigo",

    authAdmin,

    (req, res) => {

        const r =
            db
                .prepare(
                    "DELETE FROM convidados WHERE codigo = ?"
                )
                .run(
                    req.params.codigo
                );


        if (!r.changes) {

            return res
                .status(404)
                .json({
                    erro:
                        "Convidado não encontrado."
                });

        }


        res.json({
            ok: true
        });

    }
);


// REPOR CONVITE

app.post(
    "/api/admin/repor/:codigo",

    authAdmin,

    (req, res) => {

        const r =
            db
                .prepare(`
                    UPDATE convidados

                    SET
                        estado = 'Não utilizado',
                        usado_em = NULL

                    WHERE codigo = ?
                `)
                .run(
                    req.params.codigo
                );


        if (!r.changes) {

            return res
                .status(404)
                .json({
                    erro:
                        "Convite não encontrado."
                });

        }


        res.json({
            ok: true
        });

    }
);


// ============================================
// TESTE DA BASE DE DADOS
// ============================================

app.get(
    "/api/debug/convidados",

    (req, res) => {

        const convidados =
            db
                .prepare(`
                    SELECT
                        codigo,
                        nome,
                        pessoas,
                        estado
                    FROM convidados
                    ORDER BY id
                `)
                .all();


        res.json({
            total: convidados.length,
            convidados: convidados
        });

    }
);


// ============================================
// INICIAR SERVIDOR
// ============================================

app.listen(
    PORT,

    () => {

        console.log(
            "Sistema iniciado em:"
        );

        console.log(BASE_URL);

    }
);
