const express = require("express");
const { Pool } = require("pg");
const QRCode = require("qrcode");
const path = require("path");

const app = express();


// ============================================
// PORTA
// ============================================

const PORT = process.env.PORT || 3000;


// ============================================
// URL DO SISTEMA
// ============================================

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
// POSTGRESQL
// ============================================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});


// ============================================
// TESTAR LIGAÇÃO À BASE DE DADOS
// ============================================

async function testarBaseDados() {

    try {

        const resultado =
            await pool.query(
                "SELECT NOW()"
            );

        console.log(
            "PostgreSQL ligado com sucesso."
        );

        console.log(
            "Data da base de dados:",
            resultado.rows[0]
        );

    }

    catch (erro) {

        console.error(
            "Erro ao ligar ao PostgreSQL:"
        );

        console.error(
            erro
        );

    }

}


// ============================================
// CRIAR TABELA
// ============================================

async function criarTabela() {

    try {

        await pool.query(`
            CREATE TABLE IF NOT EXISTS convidados (

                id SERIAL PRIMARY KEY,

                codigo VARCHAR(100)
                    UNIQUE
                    NOT NULL,

                nome VARCHAR(255)
                    NOT NULL,

                pessoas INTEGER
                    NOT NULL
                    DEFAULT 1,

                estado VARCHAR(50)
                    NOT NULL
                    DEFAULT 'Não utilizado',

                usado_em TEXT,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP

            )
        `);

        console.log(
            "Tabela convidados verificada."
        );

    }

    catch (erro) {

        console.error(
            "Erro ao criar tabela:"
        );

        console.error(
            erro
        );

    }

}


// ============================================
// CONVIDADO INICIAL
// ============================================

async function seed(
    codigo,
    nome,
    pessoas
) {

    try {

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

            await pool.query(
                `
                INSERT INTO convidados
                (
                    codigo,
                    nome,
                    pessoas
                )

                VALUES
                (
                    $1,
                    $2,
                    $3
                )
                `,
                [
                    codigo,
                    nome,
                    pessoas
                ]
            );


            console.log(
                "Convidado inicial criado."
            );

        }

    }

    catch (erro) {

        console.error(
            "Erro no seed:"
        );

        console.error(
            erro
        );

    }

}


// ============================================
// INICIALIZAR BASE DE DADOS
// ============================================

async function inicializarBaseDados() {

    await testarBaseDados();

    await criarTabela();

    await seed(
        "VL2026-001",
        "Valdemiro e Esposa",
        2
    );

}


// ============================================
// EXPRESS
// ============================================

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


// ============================================
// PÁGINA INICIAL
// ============================================

app.get(
    "/",

    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "convite.html"
            )
        );

    }
);


// ============================================
// AUTENTICAÇÃO ADMIN
// ============================================

function authAdmin(
    req,
    res,
    next
) {

    const h =
        req.headers.authorization || "";


    if (
        !h.startsWith("Basic ")
    ) {

        res.set(
            "WWW-Authenticate",
            'Basic realm="Organização"'
        );


        return res
            .status(401)
            .json({
                erro:
                    "Autenticação necessária."
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
        partes
            .slice(1)
            .join(":");


    if (
        password !== ADMIN_PASSWORD
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


// ============================================
// AUTENTICAÇÃO ENTRADA
// ============================================

function authEntrada(
    req,
    res,
    next
) {

    const h =
        req.headers.authorization || "";


    if (
        !h.startsWith("Basic ")
    ) {

        return res
            .status(401)
            .json({
                erro:
                    "Autenticação necessária."
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
        partes
            .slice(1)
            .join(":");


    if (
        password !== ENTRADA_PASSWORD
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


// ============================================
// CONSULTA PÚBLICA
// ============================================

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

        catch (erro) {

            console.error(
                erro
            );


            res
                .status(500)
                .json({
                    erro:
                        "Erro ao consultar convite."
                });

        }

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
                `${BASE_URL}/convite.html?codigo=${encodeURIComponent(codigo)}`;


            const qr =
                await QRCode.toBuffer(
                    url,
                    {
                        width: 700,

                        margin: 2,

                        errorCorrectionLevel:
                            "H"
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
                .send(
                    "Erro ao gerar QR Code."
                );

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


// ============================================
// CONSULTAR CONVIDADO
// ============================================

app.get(
    "/api/entrada/consultar/:codigo",

    authEntrada,

    async (req, res) => {

        try {

            const codigo =
                req.params.codigo
                    .trim()
                    .toUpperCase();


            console.log(
                "Consulta entrada:",
                codigo
            );


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

                    WHERE
                    UPPER(
                        TRIM(codigo)
                    ) = $1
                    `,
                    [codigo]
                );


            if (
                resultado.rows.length === 0
            ) {

                console.log(
                    "Convite não encontrado:",
                    codigo
                );


                return res
                    .status(404)
                    .json({
                        erro:
                            "Convite não encontrado."
                    });

            }


            console.log(
                "Convite encontrado:",
                resultado.rows[0].codigo
            );


            res.json(
                resultado.rows[0]
            );

        }

        catch (erro) {

            console.error(
                erro
            );


            res
                .status(500)
                .json({
                    erro:
                        "Erro ao consultar convidado."
                });

        }

    }
);


// ============================================
// CONFIRMAR ENTRADA
// ============================================

app.post(
    "/api/entrada/confirmar/:codigo",

    authEntrada,

    async (req, res) => {

        try {

            const codigo =
                req.params.codigo
                    .trim()
                    .toUpperCase();


            const resultado =
                await pool.query(
                    `
                    SELECT *

                    FROM convidados

                    WHERE
                    UPPER(
                        TRIM(codigo)
                    ) = $1
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


            const convidado =
                resultado.rows[0];


            if (
                convidado.estado ===
                "Utilizado"
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
                            dateStyle:
                                "short",

                            timeStyle:
                                "short"
                        }
                    );


            await pool.query(
                `
                UPDATE convidados

                SET

                    estado = 'Utilizado',

                    usado_em = $1

                WHERE codigo = $2
                `,
                [
                    agora,
                    convidado.codigo
                ]
            );


            const atualizado =
                await pool.query(
                    `
                    SELECT *

                    FROM convidados

                    WHERE codigo = $1
                    `,
                    [
                        convidado.codigo
                    ]
                );


            res.json({

                ok: true,

                mensagem:
                    "Entrada confirmada com sucesso.",

                convidado:
                    atualizado.rows[0]

            });

        }

        catch (erro) {

            console.error(
                erro
            );


            res
                .status(500)
                .json({
                    erro:
                        "Erro ao confirmar entrada."
                });

        }

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


// ============================================
// RESUMO ADMIN
// ============================================

app.get(
    "/api/admin/resumo",

    authAdmin,

    async (req, res) => {

        try {

            const total =
                await pool.query(
                    `
                    SELECT
                    COUNT(*) AS n

                    FROM convidados
                    `
                );


            const pessoas =
                await pool.query(
                    `
                    SELECT

                    COALESCE(
                        SUM(pessoas),
                        0
                    ) AS n

                    FROM convidados
                    `
                );


            const utilizados =
                await pool.query(
                    `
                    SELECT
                    COUNT(*) AS n

                    FROM convidados

                    WHERE
                    estado = 'Utilizado'
                    `
                );


            const entraram =
                await pool.query(
                    `
                    SELECT

                    COALESCE(
                        SUM(pessoas),
                        0
                    ) AS n

                    FROM convidados

                    WHERE
                    estado = 'Utilizado'
                    `
                );


            const totalConvites =
                Number(
                    total.rows[0].n
                );


            const pessoasAutorizadas =
                Number(
                    pessoas.rows[0].n
                );


            const convitesUtilizados =
                Number(
                    utilizados.rows[0].n
                );


            const pessoasEntraram =
                Number(
                    entraram.rows[0].n
                );


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
                    totalConvites -
                    convitesUtilizados,

                pessoas_pendentes:
                    pessoasAutorizadas -
                    pessoasEntraram

            });

        }

        catch (erro) {

            console.error(
                erro
            );


            res
                .status(500)
                .json({
                    erro:
                        "Erro ao gerar resumo."
                });

        }

    }
);


// ============================================
// LISTAR CONVIDADOS
// ============================================

app.get(
    "/api/admin/convidados",

    authAdmin,

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

        catch (erro) {

            console.error(
                erro
            );


            res
                .status(500)
                .json({
                    erro:
                        "Erro ao listar convidados."
                });

        }

    }
);


// ============================================
// ADICIONAR CONVIDADO
// ============================================

app.post(
    "/api/admin/convidados",

    authAdmin,

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
                (
                    codigo,
                    nome,
                    pessoas
                )

                VALUES
                (
                    $1,
                    $2,
                    $3
                )
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

        catch (erro) {

            console.error(
                erro
            );


            if (
                erro.code === "23505"
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
                        "Erro ao adicionar convidado."
                });

        }

    }
);


// ============================================
// EDITAR CONVIDADO
// ============================================

app.put(
    "/api/admin/convidados/:codigo",

    authAdmin,

    async (req, res) => {

        try {

            let {
                nome,
                pessoas
            } = req.body;


            nome =
                (nome || "")
                    .trim();


            pessoas =
                Number(
                    pessoas
                );


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
                        nome,
                        pessoas,
                        req.params.codigo
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

        catch (erro) {

            console.error(
                erro
            );


            res
                .status(500)
                .json({
                    erro:
                        "Erro ao editar convidado."
                });

        }

    }
);


// ============================================
// ELIMINAR CONVIDADO
// ============================================

app.delete(
    "/api/admin/convidados/:codigo",

    authAdmin,

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

        catch (erro) {

            console.error(
                erro
            );


            res
                .status(500)
                .json({
                    erro:
                        "Erro ao eliminar convidado."
                });

        }

    }
);


// ============================================
// REPOR CONVITE
// ============================================

app.post(
    "/api/admin/repor/:codigo",

    authAdmin,

    async (req, res) => {

        try {

            const resultado =
                await pool.query(
                    `
                    UPDATE convidados

                    SET

                        estado =
                            'Não utilizado',

                        usado_em =
                            NULL

                    WHERE codigo = $1

                    RETURNING *
                    `,
                    [
                        req.params.codigo
                    ]
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


            res.json({
                ok: true
            });

        }

        catch (erro) {

            console.error(
                erro
            );


            res
                .status(500)
                .json({
                    erro:
                        "Erro ao repor convite."
                });

        }

    }
);


// ============================================
// DEBUG BASE DE DADOS
// ============================================

app.get(
    "/api/debug/convidados",

    async (req, res) => {

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT

                        codigo,
                        nome,
                        pessoas,
                        estado

                    FROM convidados

                    ORDER BY id
                    `
                );


            res.json({

                total:
                    resultado.rows.length,

                convidados:
                    resultado.rows

            });

        }

        catch (erro) {

            console.error(
                erro
            );


            res
                .status(500)
                .json({
                    erro:
                        "Erro na base de dados."
                });

        }

    }
);


// ============================================
// INICIAR SERVIDOR
// ============================================

async function iniciarServidor() {

    await inicializarBaseDados();


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
                "URL:"
            );

            console.log(
                BASE_URL
            );

            console.log(
                "Porta:"
            );

            console.log(
                PORT
            );

            console.log(
                "================================"
            );

        }
    );

}


iniciarServidor();
