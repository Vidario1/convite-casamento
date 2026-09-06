# Sistema de Convites Digitais — Versão 2

## Incluído
- Página pública de validação.
- QR Code exclusivo por convidado.
- Painel administrativo visual.
- Adicionar, editar e eliminar convidados.
- Contador de convidados totais, presentes e pendentes.
- Confirmação de entrada.
- Bloqueio visual de convite já utilizado.
- Reposição de convite.
- Leitura de QR Code por câmara em navegadores compatíveis.
- Base de dados SQLite local.

## Convidado de teste
- Código: VL2026-001
- Nome: Valdemiro e Esposa
- Pessoas: 2

## Instalação
1. Instale Node.js LTS.
2. Abra esta pasta no computador.
3. Execute:
   npm install
4. Defina uma senha forte antes de iniciar.

### Windows PowerShell
$env:ADMIN_PASSWORD="SUA_SENHA_FORTE"
$env:BASE_URL="https://SEU-DOMINIO.com"
npm start

### Teste local
npm start

Painel:
http://localhost:3000/admin.html

Convite de teste:
http://localhost:3000/convite.html?codigo=VL2026-001

## Publicação
Para os convidados validarem fora da sua rede, publique o sistema num servidor HTTPS e configure BASE_URL com o domínio público.
Exemplos de serviços adequados: Render, Railway, Fly.io ou um servidor/VPS próprio.

IMPORTANTE: altere a senha padrão. Nunca utilize CASAMENTO2026 em produção.
