const express = require("express");
const { Pool } = require("pg");
const QRCode = require("qrcode");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const BASE_URL =
    process.env.BASE_URL ||
    `http://localhost:${PORT}`;

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD ||
    "CASAMENTO2026";


// =========================================
// POSTGRESQL
// =========================================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});


// =========================================
// MIDDLEWARE
// =========================================

app.use(express.json());

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


// =========================================
// INICIALIZAR BASE DE DADOS
// =========================================

async function iniciarBaseDados() {

    await pool.query(`

        CREATE TABLE IF NOT EXISTS convidados (

            id SERIAL PRIMARY KEY,

            codigo TEXT UNIQUE NOT NULL,

            nome TEXT NOT NULL,

            pessoas INTEGER NOT NULL DEFAULT 1,

            estado TEXT NOT NULL
            DEFAULT 'Não utilizado',

            usado_em TEXT,

            criado_em TIMESTAMP
            DEFAULT CURRENT_TIMESTAMP

        )

    `);


    // CONVIDADO DE TESTE

    const existe =
        await pool.query(

            `
            SELECT codigo
            FROM convidados
            WHERE codigo = $1
            `,

            ["VL2026-001"]

        );


    if (existe.rows.length === 0) {

        await pool.query(

            `
            INSERT INTO convidados
            (codigo, nome, pessoas)

            VALUES ($1, $2, $3)
            `,

            [
                "VL2026-001",
                "Valdemiro e Esposa",
                2
            ]

        );

        console.log(
            "Convidado inicial criado."
        );

    }


    console.log(
        "PostgreSQL ligado com sucesso."
    );

}


// =========================================
// AUTENTICAÇÃO
// =========================================

function auth(req, res, next) {

    const h =
        req.headers.authorization || "";


    if (!h.startsWith("Basic ")) {

        res.set(
            "WWW-Authenticate",
            'Basic realm="Organizacao"'
        );


        return res
            .status(401)
            .json({

                erro:
                    "Autenticação necessária."

            });

    }


    let dados;


    try {

        dados =
            Buffer
            .from(
                h.slice(6),
                "base64"
            )
            .toString();

    }

    catch (e) {

        return res
            .status(401)
            .json({

                erro:
                    "Autenticação inválida."

            });

    }


    const partes =
        dados.split(":");


    const senha =
        partes.slice(1).join(":");


    if (
        senha !== ADMIN_PASSWORD
    ) {

        return res
            .status(401)
            .json({

                erro:
                    "Senha inválida."

            });

    }


    next();

}


// =========================================
// CONSULTA PÚBLICA
// =========================================

app.get(
    "/api/convite/:codigo",

    async (req, res) => {

        try {

            const codigo =
                req.params.codigo
                .trim()
                .toUpperCase();


            const resultado =
                await pool.query(

                    `
                    SELECT
                        codigo,
                        nome,
                        pessoas,
                        estado,
                        usado_em

                    FROM convidados

                    WHERE codigo = $1
                    `,

                    [codigo]

                );


            if (
                resultado.rows.length === 0
            ) {

                return res
                    .status(404)
                    .json({

                        erro:
                            "Convite inválido."

                    });

            }


            res.json(
                resultado.rows[0]
            );

        }

        catch (e) {

            console.error(e);

            res
                .status(500)
                .json({

                    erro:
                        "Erro ao consultar convite."

                });

        }

    }

);


// =========================================
// GERAR QR CODE
// =========================================

app.get(
    "/qr/:codigo",

    async (req, res) => {

        try {

            const codigo =
                req.params.codigo
                .trim()
                .toUpperCase();


            const resultado =
                await pool.query(

                    `
                    SELECT codigo
                    FROM convidados
                    WHERE codigo = $1
                    `,

                    [codigo]

                );


            if (
                resultado.rows.length === 0
            ) {

                return res
                    .status(404)
                    .send(
                        "Convite não encontrado."
                    );

            }


            const url =
                `${BASE_URL}/convite.html?codigo=` +
                encodeURIComponent(codigo);


            const imagem =
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
                .send(imagem);

        }

        catch (e) {

            console.error(e);

            res
                .status(500)
                .send(
                    "Erro ao gerar QR Code."
                );

        }

    }

);


// =========================================
// TESTE ADMIN
// =========================================

app.get(
    "/api/admin/test",

    auth,

    (req, res) => {

        res.json({

            ok: true

        });

    }

);


// =========================================
// RESUMO ADMIN
// =========================================

app.get(
    "/api/admin/resumo",

    auth,

    async (req, res) => {

        try {

            const totalResultado =
                await pool.query(

                    `
                    SELECT COUNT(*) AS total
                    FROM convidados
                    `

                );


            const usadosResultado =
                await pool.query(

                    `
                    SELECT COUNT(*) AS usados
                    FROM convidados
                    WHERE estado = 'Utilizado'
                    `

                );


            const total =
                Number(
                    totalResultado
                    .rows[0]
                    .total
                );


            const usados =
                Number(
                    usadosResultado
                    .rows[0]
                    .usados
                );


            res.json({

                total,

                usados,

                nao_utilizados:
                    total - usados

            });

        }

        catch (e) {

            console.error(e);

            res
                .status(500)
                .json({

                    erro:
                        "Erro ao consultar resumo."

                });

        }

    }

);


// =========================================
// LISTAR CONVIDADOS
// =========================================

app.get(
    "/api/admin/convidados",

    auth,

    async (req, res) => {

        try {

            const resultado =
                await pool.query(

                    `
                    SELECT *
                    FROM convidados
                    ORDER BY id DESC
                    `

                );


            res.json(
                resultado.rows
            );

        }

        catch (e) {

            console.error(e);

            res
                .status(500)
                .json({

                    erro:
                        "Erro ao listar convidados."

                });

        }

    }

);


// =========================================
// ADICIONAR CONVIDADO
// =========================================

app.post(
    "/api/admin/convidados",

    auth,

    async (req, res) => {

        try {

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


            await pool.query(

                `
                INSERT INTO convidados
                (codigo, nome, pessoas)

                VALUES ($1, $2, $3)
                `,

                [
                    codigo,
                    nome,
                    pessoas
                ]

            );


            res.json({

                ok: true

            });

        }

        catch (e) {

            console.error(e);


            if (
                e.code === "23505"
            ) {

                return res
                    .status(400)
                    .json({

                        erro:
                            "Este código já existe."

                    });

            }


            res
                .status(500)
                .json({

                    erro:
                        "Erro ao criar convidado."

                });

        }

    }

);


// =========================================
// EDITAR CONVIDADO
// =========================================

app.put(
    "/api/admin/convidados/:codigo",

    auth,

    async (req, res) => {

        try {

            const {
                nome,
                pessoas
            } = req.body;


            const resultado =
                await pool.query(

                    `
                    UPDATE convidados

                    SET
                        nome = $1,
                        pessoas = $2

                    WHERE codigo = $3

                    RETURNING *
                    `,

                    [

                        (nome || "").trim(),

                        Number(pessoas),

                        req.params.codigo
                        .trim()
                        .toUpperCase()

                    ]

                );


            if (
                resultado.rows.length === 0
            ) {

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

        catch (e) {

            console.error(e);

            res
                .status(500)
                .json({

                    erro:
                        "Erro ao editar convidado."

                });

        }

    }

);


// =========================================
// ELIMINAR CONVIDADO
// =========================================

app.delete(
    "/api/admin/convidados/:codigo",

    auth,

    async (req, res) => {

        try {

            const resultado =
                await pool.query(

                    `
                    DELETE FROM convidados

                    WHERE codigo = $1

                    RETURNING *
                    `,

                    [

                        req.params.codigo
                        .trim()
                        .toUpperCase()

                    ]

                );


            if (
                resultado.rows.length === 0
            ) {

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

        catch (e) {

            console.error(e);

            res
                .status(500)
                .json({

                    erro:
                        "Erro ao eliminar convidado."

                });

        }

    }

);


// =========================================
// CONTROLO DE ENTRADA
// TESTAR LOGIN
// =========================================

app.get(
    "/api/entrada/test",

    auth,

    (req, res) => {

        res.json({

            ok: true

        });

    }

);


// =========================================
// CONTROLO DE ENTRADA
// CONSULTAR CONVIDADO
// =========================================

app.get(
    "/api/entrada/consultar/:codigo",

    auth,

    async (req, res) => {

        try {

            const codigo =
                req.params.codigo
                .trim()
                .toUpperCase();


            const resultado =
                await pool.query(

                    `
                    SELECT
                        codigo,
                        nome,
                        pessoas,
                        estado,
                        usado_em

                    FROM convidados

                    WHERE codigo = $1
                    `,

                    [codigo]

                );


            if (
                resultado.rows.length === 0
            ) {

                return res
                    .status(404)
                    .json({

                        erro:
                            "Convite não encontrado."

                    });

            }


            res.json(
                resultado.rows[0]
            );

        }

        catch (e) {

            console.error(e);

            res
                .status(500)
                .json({

                    erro:
                        "Erro ao consultar convite."

                });

        }

    }

);


// =========================================
// CONTROLO DE ENTRADA
// CONFIRMAR ENTRADA
// =========================================

app.post(
    "/api/entrada/confirmar/:codigo",

    auth,

    async (req, res) => {

        try {

            const codigo =
                req.params.codigo
                .trim()
                .toUpperCase();


            const consulta =
                await pool.query(

                    `
                    SELECT *
                    FROM convidados

                    WHERE codigo = $1
                    `,

                    [codigo]

                );


            if (
                consulta.rows.length === 0
            ) {

                return res
                    .status(404)
                    .json({

                        erro:
                            "Convite inválido."

                    });

            }


            const convidado =
                consulta.rows[0];


            if (
                convidado.estado ===
                "Utilizado"
            ) {

                return res
                    .status(409)
                    .json({

                        erro:
                            "Este convite já foi utilizado.",

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


            const resultado =
                await pool.query(

                    `
                    UPDATE convidados

                    SET

                        estado = 'Utilizado',

                        usado_em = $1

                    WHERE codigo = $2

                    RETURNING *
                    `,

                    [
                        agora,
                        codigo
                    ]

                );


            res.json({

                ok: true,

                mensagem:
                    "Entrada confirmada.",

                convidado:
                    resultado.rows[0]

            });

        }

        catch (e) {

            console.error(e);

            res
                .status(500)
                .json({

                    erro:
                        "Erro ao confirmar entrada."

                });

        }

    }

);


// =========================================
// REPOR CONVITE
// =========================================

app.post(
    "/api/admin/repor/:codigo",

    auth,

    async (req, res) => {

        try {

            await pool.query(

                `
                UPDATE convidados

                SET

                    estado = 'Não utilizado',

                    usado_em = NULL

                WHERE codigo = $1
                `,

                [

                    req.params.codigo
                    .trim()
                    .toUpperCase()

                ]

            );


            res.json({

                ok: true

            });

        }

        catch (e) {

            console.error(e);

            res
                .status(500)
                .json({

                    erro:
                        "Erro ao repor convite."

                });

        }

    }

);


// =========================================
// INICIAR SERVIDOR
// =========================================

iniciarBaseDados()

    .then(() => {

        app.listen(

            PORT,

            () => {

                console.log(
                    "================================"
                );

                console.log(
                    "Sistema iniciado."
                );

                console.log(
                    "URL: " +
                    BASE_URL
                );

                console.log(
                    "Porta: " +
                    PORT
                );

                console.log(
                    "================================"
                );

            }

        );

    })

    .catch((erro) => {

        console.error(
            "Erro ao ligar ao PostgreSQL:"
        );

        console.error(erro);

        process.exit(1);

    });
