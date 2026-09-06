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


/* =========================================================
   BASE DE DADOS
========================================================= */

const db = new Database("convites.db");

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


/* =========================================================
   CONVIDADO INICIAL
========================================================= */

function seed(codigo, nome, pessoas) {

  const existe = db
    .prepare("SELECT codigo FROM convidados WHERE codigo=?")
    .get(codigo);

  if (!existe) {

    db
      .prepare(
        "INSERT INTO convidados(codigo,nome,pessoas) VALUES(?,?,?)"
      )
      .run(codigo, nome, pessoas);

  }

}

seed(
  "VL2026-001",
  "Valdemiro e Esposa",
  2
);


/* =========================================================
   CONFIGURAÇÕES EXPRESS
========================================================= */

app.use(express.json());

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


app.get("/", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "public",
      "convite.html"
    )
  );

});


/* =========================================================
   AUTENTICAÇÃO ADMINISTRATIVA
========================================================= */

function auth(req, res, next) {

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
        erro: "Autenticação necessária"
      });

  }


  const [, p] =
    Buffer
      .from(
        h.slice(6),
        "base64"
      )
      .toString()
      .split(":");


  if (p !== ADMIN_PASSWORD) {

    return res
      .status(401)
      .json({
        erro: "Senha inválida"
      });

  }


  next();

}


/* =========================================================
   FUNÇÃO PARA DATA E HORA
========================================================= */

function dataHoraActual() {

  return new Date().toLocaleString(
    "pt-PT",
    {
      timeZone: "Africa/Luanda",
      dateStyle: "short",
      timeStyle: "short"
    }
  );

}


/* =========================================================
   PÁGINA DE VALIDAÇÃO DO CONVITE
========================================================= */

app.get(
  "/api/convite/:codigo",
  (req, res) => {

    const x = db
      .prepare(`
        SELECT
          codigo,
          nome,
          pessoas,
          estado,
          usado_em
        FROM convidados
        WHERE codigo=?
      `)
      .get(
        req.params.codigo
      );


    if (!x) {

      return res
        .status(404)
        .json({
          erro: "Convite inválido"
        });

    }


    res.json(x);

  }
);


/* =========================================================
   GERAR QR CODE
========================================================= */

app.get(
  "/qr/:codigo",
  async (req, res) => {

    const x = db
      .prepare(
        "SELECT codigo FROM convidados WHERE codigo=?"
      )
      .get(
        req.params.codigo
      );


    if (!x) {

      return res
        .status(404)
        .send("Não encontrado");

    }


    const url =
      `${BASE_URL}/convite.html?codigo=${encodeURIComponent(
        req.params.codigo
      )}`;


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
);


/* =========================================================
   TESTE ADMINISTRATIVO
========================================================= */

app.get(
  "/api/admin/test",
  auth,
  (req, res) => {

    res.json({
      ok: true
    });

  }
);


/* =========================================================
   RESUMO DO EVENTO
========================================================= */

app.get(
  "/api/admin/resumo",
  auth,
  (req, res) => {

    /*
      TOTAL DE CONVITES
    */

    const total = db
      .prepare(
        "SELECT COUNT(*) AS n FROM convidados"
      )
      .get()
      .n;


    /*
      TOTAL DE PESSOAS AUTORIZADAS
    */

    const pessoasAutorizadas = db
      .prepare(`
        SELECT
          COALESCE(SUM(pessoas),0) AS n
        FROM convidados
      `)
      .get()
      .n;


    /*
      TOTAL DE CONVITES UTILIZADOS
    */

    const usados = db
      .prepare(`
        SELECT
          COUNT(*) AS n
        FROM convidados
        WHERE estado='Utilizado'
      `)
      .get()
      .n;


    /*
      TOTAL DE PESSOAS QUE ENTRARAM
    */

    const pessoasEntraram = db
      .prepare(`
        SELECT
          COALESCE(SUM(pessoas),0) AS n
        FROM convidados
        WHERE estado='Utilizado'
      `)
      .get()
      .n;


    /*
      CONVIDADOS PENDENTES
    */

    const pendentes = db
      .prepare(`
        SELECT
          COUNT(*) AS n
        FROM convidados
        WHERE estado='Não utilizado'
      `)
      .get()
      .n;


    /*
      PESSOAS AINDA PENDENTES
    */

    const pessoasPendentes = db
      .prepare(`
        SELECT
          COALESCE(SUM(pessoas),0) AS n
        FROM convidados
        WHERE estado='Não utilizado'
      `)
      .get()
      .n;


    res.json({

      /*
        COMPATIBILIDADE
        COM O PAINEL ACTUAL
      */

      total: total,

      usados: usados,

      nao_utilizados:
        total - usados,


      /*
        NOVAS ESTATÍSTICAS
      */

      total_convites:
        total,

      pessoas_autorizadas:
        pessoasAutorizadas,

      convites_utilizados:
        usados,

      pessoas_entraram:
        pessoasEntraram,

      convites_pendentes:
        pendentes,

      pessoas_pendentes:
        pessoasPendentes

    });

  }
);


/* =========================================================
   LISTAR CONVIDADOS
   SUPORTA PESQUISA E FILTROS
========================================================= */

app.get(
  "/api/admin/convidados",
  auth,
  (req, res) => {

    const pesquisa =
      (
        req.query.q ||
        ""
      )
      .trim();


    const estado =
      (
        req.query.estado ||
        ""
      )
      .trim();


    let sql = `
      SELECT *
      FROM convidados
      WHERE 1=1
    `;


    const params = [];


    /*
      PESQUISA
      POR CÓDIGO OU NOME
    */

    if (pesquisa) {

      sql += `
        AND (
          codigo LIKE ?
          OR
          nome LIKE ?
        )
      `;


      const termo =
        `%${pesquisa}%`;


      params.push(termo);
      params.push(termo);

    }


    /*
      FILTRO DE ESTADO
    */

    if (
      estado === "Utilizado"
    ) {

      sql += `
        AND estado='Utilizado'
      `;

    }


    if (
      estado === "Pendente"
    ) {

      sql += `
        AND estado='Não utilizado'
      `;

    }


    sql += `
      ORDER BY id DESC
    `;


    const convidados =
      db
        .prepare(sql)
        .all(...params);


    res.json(convidados);

  }
);


/* =========================================================
   ADICIONAR CONVIDADO
========================================================= */

app.post(
  "/api/admin/convidados",
  auth,
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


    try {

      db
        .prepare(`
          INSERT INTO convidados(
            codigo,
            nome,
            pessoas
          )
          VALUES(?,?,?)
        `)
        .run(
          codigo,
          nome,
          pessoas
        );


      res.json({
        ok: true
      });


    } catch (e) {

      res
        .status(400)
        .json({
          erro:
            "Este código já existe."
        });

    }

  }
);


/* =========================================================
   EDITAR CONVIDADO
========================================================= */

app.put(
  "/api/admin/convidados/:codigo",
  auth,
  (req, res) => {

    const {
      nome,
      pessoas
    } = req.body;


    const novoNome =
      (nome || "")
        .trim();


    const novasPessoas =
      Number(pessoas);


    if (
      !novoNome ||
      novasPessoas < 1
    ) {

      return res
        .status(400)
        .json({
          erro:
            "Nome e número de pessoas são obrigatórios."
        });

    }


    const r =
      db
        .prepare(`
          UPDATE convidados
          SET
            nome=?,
            pessoas=?
          WHERE codigo=?
        `)
        .run(
          novoNome,
          novasPessoas,
          req.params.codigo
        );


    if (!r.changes) {

      return res
        .status(404)
        .json({
          erro:
            "Não encontrado"
        });

    }


    res.json({
      ok: true
    });

  }
);


/* =========================================================
   ELIMINAR CONVIDADO
========================================================= */

app.delete(
  "/api/admin/convidados/:codigo",
  auth,
  (req, res) => {

    const r =
      db
        .prepare(`
          DELETE FROM convidados
          WHERE codigo=?
        `)
        .run(
          req.params.codigo
        );


    if (!r.changes) {

      return res
        .status(404)
        .json({
          erro:
            "Não encontrado"
        });

    }


    res.json({
      ok: true
    });

  }
);


/* =========================================================
   CONFIRMAR ENTRADA
========================================================= */

app.post(
  "/api/admin/checkin/:codigo",
  auth,
  (req, res) => {

    const codigo =
      req.params.codigo
        .trim()
        .toUpperCase();


    const x =
      db
        .prepare(`
          SELECT *
          FROM convidados
          WHERE codigo=?
        `)
        .get(codigo);


    if (!x) {

      return res
        .status(404)
        .json({
          erro:
            "Convite inválido"
        });

    }


    /*
      IMPEDIR
      DUPLA UTILIZAÇÃO
    */

    if (
      x.estado === "Utilizado"
    ) {

      return res
        .status(409)
        .json({
          erro:
            "Este convite já foi utilizado.",
          convidado: x
        });

    }


    const agora =
      dataHoraActual();


    db
      .prepare(`
        UPDATE convidados
        SET
          estado='Utilizado',
          usado_em=?
        WHERE codigo=?
      `)
      .run(
        agora,
        codigo
      );


    res.json({

      ok: true,

      mensagem:
        `Entrada confirmada para ${x.pessoas} pessoa(s).`,

      convidado: {

        ...x,

        estado:
          "Utilizado",

        usado_em:
          agora

      }

    });

  }
);


/* =========================================================
   REPOR CONVITE
========================================================= */

app.post(
  "/api/admin/repor/:codigo",
  auth,
  (req, res) => {

    const r =
      db
        .prepare(`
          UPDATE convidados
          SET
            estado='Não utilizado',
            usado_em=NULL
          WHERE codigo=?
        `)
        .run(
          req.params.codigo
        );


    if (!r.changes) {

      return res
        .status(404)
        .json({
          erro:
            "Não encontrado"
        });

    }


    res.json({
      ok: true
    });

  }
);


/* =========================================================
   EXPORTAR CSV
========================================================= */

app.get(
  "/api/admin/exportar/csv",
  auth,
  (req, res) => {

    const convidados =
      db
        .prepare(`
          SELECT
            codigo,
            nome,
            pessoas,
            estado,
            usado_em,
            criado_em
          FROM convidados
          ORDER BY id DESC
        `)
        .all();


    /*
      PROTEGER
      CAMPOS CSV
    */

    function csvCampo(valor) {

      if (
        valor === null ||
        valor === undefined
      ) {

        return "";

      }


      const texto =
        String(valor)
          .replace(/"/g, '""');


      return `"${texto}"`;

    }


    const linhas = [];


    linhas.push([
      "Código",
      "Nome",
      "Pessoas autorizadas",
      "Estado",
      "Data e hora da entrada",
      "Data de criação"
    ].map(csvCampo).join(";"));


    convidados.forEach(
      x => {

        linhas.push([

          x.codigo,

          x.nome,

          x.pessoas,

          x.estado,

          x.usado_em || "",

          x.criado_em || ""

        ]
          .map(csvCampo)
          .join(";")
        );

      }
    );


    /*
      RESUMO
    */

    const resumo =
      db
        .prepare(`
          SELECT

            COUNT(*) AS total_convites,

            COALESCE(
              SUM(pessoas),
              0
            ) AS pessoas_autorizadas,

            COALESCE(
              SUM(
                CASE
                  WHEN estado='Utilizado'
                  THEN pessoas
                  ELSE 0
                END
              ),
              0
            ) AS pessoas_entraram

          FROM convidados
        `)
        .get();


    linhas.push("");


    linhas.push([
      "RESUMO"
    ].map(csvCampo).join(";"));


    linhas.push([
      "Total de convites",
      resumo.total_convites
    ].map(csvCampo).join(";"));


    linhas.push([
      "Total de pessoas autorizadas",
      resumo.pessoas_autorizadas
    ].map(csvCampo).join(";"));


    linhas.push([
      "Total de pessoas que entraram",
      resumo.pessoas_entraram
    ].map(csvCampo).join(";"));


    const csv =
      "\uFEFF" +
      linhas.join("\n");


    res.setHeader(
      "Content-Type",
      "text/csv; charset=utf-8"
    );


    res.setHeader(
      "Content-Disposition",
      'attachment; filename="lista-convidados.csv"'
    );


    res.send(csv);

  }
);


/* =========================================================
   EXPORTAR PARA EXCEL
   FORMATO COMPATÍVEL COM EXCEL
========================================================= */

app.get(
  "/api/admin/exportar/excel",
  auth,
  (req, res) => {

    const convidados =
      db
        .prepare(`
          SELECT
            codigo,
            nome,
            pessoas,
            estado,
            usado_em,
            criado_em
          FROM convidados
          ORDER BY id DESC
        `)
        .all();


    function escaparHtml(texto) {

      return String(
        texto || ""
      )
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    }


    let html = `
      <html>
      <head>
        <meta charset="UTF-8">
      </head>

      <body>

      <h2>
        Lista de Convidados
      </h2>

      <table border="1">

      <tr>

        <th>Código</th>

        <th>Nome</th>

        <th>Pessoas autorizadas</th>

        <th>Estado</th>

        <th>Data e hora da entrada</th>

        <th>Data de criação</th>

      </tr>
    `;


    convidados.forEach(
      x => {

        html += `

          <tr>

            <td>
              ${escaparHtml(x.codigo)}
            </td>

            <td>
              ${escaparHtml(x.nome)}
            </td>

            <td>
              ${escaparHtml(x.pessoas)}
            </td>

            <td>
              ${escaparHtml(x.estado)}
            </td>

            <td>
              ${escaparHtml(x.usado_em || "")}
            </td>

            <td>
              ${escaparHtml(x.criado_em || "")}
            </td>

          </tr>

        `;

      }
    );


    html += `

      </table>

      </body>

      </html>

    `;


    res.setHeader(
      "Content-Type",
      "application/vnd.ms-excel; charset=utf-8"
    );


    res.setHeader(
      "Content-Disposition",
      'attachment; filename="lista-convidados.xls"'
    );


    res.send(
      "\uFEFF" + html
    );

  }
);


/* =========================================================
   INICIAR SISTEMA
========================================================= */

app.listen(
  PORT,
  () => {

    console.log(
      "Sistema: " +
      BASE_URL
    );

  }
);
