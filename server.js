const express = require("express");
const { Pool } = require("pg");
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


/* =========================================
POSTGRESQL
========================================= */

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl:
        process.env.DATABASE_URL
            ? { rejectUnauthorized: false }
            : false
});


/* =========================================
CRIAR TABELA
========================================= */

async function iniciarBaseDados() {

    try {

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

        console.log(
            "Base de dados ligada com sucesso."
        );

    }

    catch (erro) {

        console.error(
            "Erro ao iniciar a base de dados:",
            erro
        );

    }

}


/* =========================================
MIDDLEWARE
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


/* =========================================
AUTENTICAÇÃO
========================================= */

function auth(
    req,
    res,
    next
) {

    const h =
        req.headers.authorization ||
        "";


    if(
        !h.startsWith(
            "Basic "
        )
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


    const senha =
        partes.slice(1).join(":");


    if(
        senha !==
        ADMIN_PASSWORD
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


/* =========================================
CONSULTA PÚBLICA DO CONVITE
========================================= */

app.get(
    "/api/convite/:codigo",

    async (
        req,
        res
    ) => {

        try {

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

                    WHERE UPPER(codigo) =
                    UPPER($1)

                    `,

                    [

                        req.params.codigo

                    ]

                );


            if(
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

        catch(
            erro
        ) {

            console.error(
                erro
            );


            res
            .status(500)
            .json({

                erro:
                    "Erro ao consultar o convite."

            });

        }

    }
);


/* =========================================
GERAR QR CODE
========================================= */

app.get(
    "/qr/:codigo",

    async (
        req,
        res
    ) => {

        try {

            const resultado =
                await pool.query(

                    `

                    SELECT codigo

                    FROM convidados

                    WHERE UPPER(codigo) =
                    UPPER($1)

                    `,

                    [

                        req.params.codigo

                    ]

                );


            if(
                resultado.rows.length === 0
            ) {

                return res
                .status(404)
                .send(
                    "Convite não encontrado."
                );

            }


            const codigo =
                resultado
                .rows[0]
                .codigo;


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

        catch(
            erro
        ) {

            console.error(
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


/* =========================================
TESTE ADMIN
========================================= */

app.get(
    "/api/admin/test",

    auth,

    (
        req,
        res
    ) => {

        res.json({

            ok: true

        });

    }
);


/* =========================================
RESUMO ADMIN
========================================= */

app.get(
    "/api/admin/resumo",

    auth,

    async (
        req,
        res
    ) => {

        try {

            const resultado =
                await pool.query(`

                    SELECT

                        COUNT(*) AS total,

                        COALESCE(
                            SUM(pessoas),
                            0
                        )
                        AS pessoas_autorizadas,

                        COUNT(*)
                        FILTER (

                            WHERE estado =
                            'Utilizado'

                        )
                        AS usados,

                        COALESCE(

                            SUM(pessoas)
                            FILTER (

                                WHERE estado =
                                'Utilizado'

                            ),

                            0

                        )
                        AS pessoas_entraram

                    FROM convidados

                `);


            const dados =
                resultado.rows[0];


            const total =
                Number(
                    dados.total
                );


            const pessoasAutorizadas =
                Number(
                    dados.pessoas_autorizadas
                );


            const usados =
                Number(
                    dados.usados
                );


            const pessoasEntraram =
                Number(
                    dados.pessoas_entraram
                );


            res.json({

                total:
                    total,


                pessoas_autorizadas:
                    pessoasAutorizadas,


                usados:
                    usados,


                pessoas_entraram:
                    pessoasEntraram,


                nao_utilizados:
                    total -
                    usados,


                pessoas_pendentes:

                    pessoasAutorizadas -

                    pessoasEntraram

            });

        }

        catch(
            erro
        ) {

            console.error(
                "Erro no resumo:",
                erro
            );


            res
            .status(500)
            .json({

                erro:
                    "Erro ao carregar o resumo."

            });

        }

    }
);


/* =========================================
LISTAR CONVIDADOS ADMIN
========================================= */

app.get(
    "/api/admin/convidados",

    auth,

    async (
        req,
        res
    ) => {

        try {

            const resultado =
                await pool.query(`

                    SELECT *

                    FROM convidados

                    ORDER BY id DESC

                `);


            res.json(
                resultado.rows
            );

        }

        catch(
            erro
        ) {

            console.error(
                erro
            );


            res
            .status(500)
            .json({

                erro:
                    "Erro ao carregar convidados."

            });

        }

    }
);


/* =========================================
ADICIONAR CONVIDADO
========================================= */

app.post(
    "/api/admin/convidados",

    auth,

    async (
        req,
        res
    ) => {

        try {

            let {

                codigo,
                nome,
                pessoas

            } = req.body;


            codigo =
                (
                    codigo ||
                    ""
                )
                .trim()
                .toUpperCase();


            nome =
                (
                    nome ||
                    ""
                )
                .trim();


            pessoas =
                Number(
                    pessoas ||
                    1
                );


            if(

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

                INSERT INTO convidados (

                    codigo,
                    nome,
                    pessoas

                )

                VALUES (

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

        catch(
            erro
        ) {

            console.error(
                erro
            );


            if(
                erro.code ===
                "23505"
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


/* =========================================
EDITAR CONVIDADO
========================================= */

app.put(
    "/api/admin/convidados/:codigo",

    auth,

    async (
        req,
        res
    ) => {

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

                    WHERE UPPER(codigo) =
                    UPPER($3)

                    `,

                    [

                        (
                            nome ||
                            ""
                        )
                        .trim(),

                        Number(
                            pessoas
                        ),

                        req.params.codigo

                    ]

                );


            if(
                resultado.rowCount === 0
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

        catch(
            erro
        ) {

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


/* =========================================
ELIMINAR CONVIDADO
========================================= */

app.delete(
    "/api/admin/convidados/:codigo",

    auth,

    async (
        req,
        res
    ) => {

        try {

            const resultado =
                await pool.query(

                    `

                    DELETE FROM convidados

                    WHERE UPPER(codigo) =
                    UPPER($1)

                    `,

                    [

                        req.params.codigo

                    ]

                );


            if(
                resultado.rowCount === 0
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

        catch(
            erro
        ) {

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


/* =========================================
TESTE CONTROLO DE ENTRADA
========================================= */

app.get(
    "/api/entrada/test",

    auth,

    (
        req,
        res
    ) => {

        res.json({

            ok: true

        });

    }
);


/* =========================================
CONSULTAR CONVITE NA ENTRADA
========================================= */

app.get(
    "/api/entrada/consultar/:codigo",

    auth,

    async (
        req,
        res
    ) => {

        try {

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

                    WHERE UPPER(codigo) =
                    UPPER($1)

                    `,

                    [

                        req.params.codigo

                    ]

                );


            if(
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

        catch(
            erro
        ) {

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


/* =========================================
CONFIRMAR ENTRADA
========================================= */

app.post(
    "/api/entrada/confirmar/:codigo",

    auth,

    async (
        req,
        res
    ) => {

        try {

            const resultado =
                await pool.query(

                    `

                    SELECT *

                    FROM convidados

                    WHERE UPPER(codigo) =
                    UPPER($1)

                    `,

                    [

                        req.params.codigo

                    ]

                );


            if(
                resultado.rows.length === 0
            ) {

                return res
                .status(404)
                .json({

                    erro:
                        "Convite não encontrado."

                });

            }


            const convidado =
                resultado.rows[0];


            if(
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

                    estado =
                    'Utilizado',

                    usado_em =
                    $1

                WHERE UPPER(codigo) =
                UPPER($2)

                `,

                [

                    agora,

                    req.params.codigo

                ]

            );


            const convidadoAtualizado = {

                ...convidado,

                estado:
                    "Utilizado",

                usado_em:
                    agora

            };


            res.json({

                ok: true,

                mensagem:

                    "Entrada confirmada com sucesso.",

                convidado:

                    convidadoAtualizado

            });

        }

        catch(
            erro
        ) {

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


/* =========================================
REPOR CONVITE
========================================= */

app.post(
    "/api/admin/repor/:codigo",

    auth,

    async (
        req,
        res
    ) => {

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

                    WHERE UPPER(codigo) =
                    UPPER($1)

                    `,

                    [

                        req.params.codigo

                    ]

                );


            if(
                resultado.rowCount === 0
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

        catch(
            erro
        ) {

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


/* =========================================
INICIAR SERVIDOR
========================================= */

iniciarBaseDados()
.then(() => {

    app.listen(

        PORT,

        () => {

            console.log(

                "Sistema disponível em: " +

                BASE_URL

            );

        }

    );

});
