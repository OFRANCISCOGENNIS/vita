# Publicar o CortaAí na Vercel (sem token, pelo navegador)

Este guia publica o **frontend** do CortaAí numa URL pública em ~3 minutos. A
Vercel puxa o código direto do GitHub e faz o build — você não precisa instalar
nada nem colar token em lugar nenhum. A cada novo push no branch, ela republica
sozinha.

> O frontend roda 100% com dados de demonstração (mocks) quando não há API
> configurada. Ou seja: o link já sobe totalmente navegável — landing, Radar,
> Raio-X, editor e o Estúdio IA — sem precisar de backend nem de chaves pagas.

## Passo a passo

1. Acesse **https://vercel.com** e clique em **Log In** → **Continue with GitHub**.
2. No painel, clique em **Add New… → Project**.
3. Em **Import Git Repository**, encontre **`OFRANCISCOGENNIS/anonymousKS`** e
   clique em **Import**.
   - Se o repositório não aparecer, clique em **Adjust GitHub App Permissions** e
     autorize a Vercel a enxergar esse repo.
4. Na tela de configuração do projeto, ajuste **dois** campos:

   | Campo | Valor |
   |-------|-------|
   | **Root Directory** | `cortaai/apps/web` &nbsp;(clique em *Edit* e selecione essa pasta) |
   | **Production Branch** | `claude/cortaai-video-platform-87du9b` |

   - O **Framework Preset** já deve aparecer como **Next.js** (por causa do
     `vercel.json`). Build Command e Output podem ficar no padrão.
   - **Production Branch** fica em **Settings → Git** (se não aparecer no import,
     configure logo depois do primeiro deploy e clique em *Redeploy*). Isso é
     necessário porque o CortaAí está no branch do PR, não na `main`.
5. Clique em **Deploy**. Em ~2 minutos aparece a URL pública
   (algo como `https://anonymob_useraks.vercel.app`).

Pronto — abra o link no celular ou mande para quem quiser. 🚀

### Conta de demonstração
Na tela de login do app, qualquer e-mail/senha entra no modo demo. Para os dados
seed prontos, use **`criador@cortaai.com.br`**.

## Alternativa: publicar a partir da `main`

Se preferir não mexer no "Production Branch", primeiro **mescle o PR #18 na
`main`** no GitHub; aí a Vercel usa a `main` por padrão e basta manter o
**Root Directory = `cortaai/apps/web`**.

## Depois: ligar o backend real (opcional)

O deploy acima é só o frontend (modo demo). Para os cortes/render funcionarem de
verdade, suba o backend completo (API + workers + banco) num host que aceite
Docker — **Railway**, **Render** ou um **VPS** — com o `docker-compose.yml` da
raiz. Depois, na Vercel, defina a variável de ambiente
**`NEXT_PUBLIC_API_URL`** apontando para a URL pública dessa API. As partes que
chamam serviços externos (YouTube Data API, geração de vídeo, Stripe) exigem as
respectivas chaves no `.env` — sem elas, rodam em modo demonstração.

## Segurança

Se você chegou a gerar um **token da Vercel** antes, **revogue-o** em
*vercel.com → Settings → Tokens*. O fluxo por este guia não usa token nenhum.
