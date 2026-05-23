# Tasky — Guia de Deploy (Render + Supabase)

Tempo estimado: **15 minutos**. Você só vai clicar e colar — sem digitar comandos.

---

## PARTE 1 — Supabase (banco de dados)

### 1.1 Criar o banco

1. Acesse **supabase.com** → faça login com GitHub
2. Clique em **"New project"**
3. Preencha:
   - **Name:** `tasky`
   - **Database Password:** crie uma senha forte e **anote ela agora**
   - **Region:** South America (São Paulo) — mais perto do Brasil
4. Clique em **"Create new project"** — aguarde ~2 minutos

### 1.2 Pegar a connection string

1. No painel do Supabase → clique em **Settings** (engrenagem) → **Database**
2. Role até **"Connection string"**
3. Selecione a aba **"URI"**
4. Copie a string — ela se parece com:
   ```
   postgresql://postgres:[SUA_SENHA]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```
5. **Substitua `[YOUR-PASSWORD]` pela senha que você anotou**
6. Salve essa string — você vai precisar ela no Render

---

## PARTE 2 — GitHub (repositório)

### 2.1 Criar o repositório

1. Acesse **github.com** → clique em **"New repository"**
2. Nome: `tasky`
3. Marque como **Public** (necessário para Render grátis)
4. Clique em **"Create repository"**

### 2.2 Fazer upload do código

1. Na página do repositório criado, clique em **"uploading an existing file"**
2. Arraste a pasta **`backend`** inteira e a pasta **`frontend`** inteira e o arquivo `render.yaml`
3. Clique em **"Commit changes"**

> Alternativa via terminal (se tiver Git instalado):
> ```bash
> cd C:\Users\guerr\Downloads\tasky
> git init
> git add .
> git commit -m "inicial"
> git remote add origin https://github.com/SEU_USUARIO/tasky.git
> git push -u origin main
> ```

---

## PARTE 3 — Render (hospedagem)

### 3.1 Criar conta e conectar GitHub

1. Acesse **render.com** → clique em **"Get Started"**
2. Faça login com **GitHub** (autorize o acesso)

### 3.2 Deploy do Backend

1. No painel do Render → clique em **"New +"** → **"Web Service"**
2. Conecte o repositório `tasky`
3. Configure:
   - **Name:** `tasky-backend`
   - **Root Directory:** `backend`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** `Free`
4. Na seção **"Environment Variables"**, adicione:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | *(a connection string do Supabase)* |
   | `SECRET_KEY` | *(qualquer string longa aleatória, ex: `minha-chave-super-secreta-123456`)* |
   | `FRONTEND_URL` | *(deixe em branco por agora — você preenche depois)* |
   | `DEBUG` | `false` |

5. Clique em **"Create Web Service"**
6. Aguarde o deploy (~3 minutos)
7. **Copie a URL do backend** — ex: `https://tasky-backend.onrender.com`

### 3.3 Deploy do Frontend

1. No painel do Render → **"New +"** → **"Static Site"**
2. Conecte o mesmo repositório `tasky`
3. Configure:
   - **Name:** `tasky-frontend`
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
4. Na seção **"Environment Variables"**, adicione:

   | Variável | Valor |
   |---|---|
   | `VITE_API_URL` | *(URL do backend, ex: `https://tasky-backend.onrender.com`)* |

5. Clique em **"Create Static Site"**
6. Aguarde o build (~2 minutos)
7. **Copie a URL do frontend** — ex: `https://tasky-frontend.onrender.com`

### 3.4 Voltar e atualizar o FRONTEND_URL no backend

1. No painel do Render → clique no serviço `tasky-backend`
2. Vá em **"Environment"**
3. Edite `FRONTEND_URL` e cole a URL do frontend
4. Clique em **"Save Changes"** — o backend vai restartar automaticamente

---

## PARTE 4 — Testar

1. Acesse a URL do frontend: `https://tasky-frontend.onrender.com`
2. Crie sua conta
3. Crie um workspace e invite seu time pelo email

---

## Compartilhar com o time

Envie para cada membro do seu time:

```
Acesse: https://tasky-frontend.onrender.com
Crie sua conta com seu email
Me avise que eu te adiciono ao workspace
```

Ou use o sistema de convite dentro do Tasky:
- Sidebar → botão "Convidar" → digite o email
- Se a pessoa já tiver conta: entra automaticamente
- Se não tiver: recebe um token para usar na URL `/join/TOKEN`

---

## ⚠️ Limitações do plano gratuito Render

| Limitação | Impacto |
|---|---|
| Backend "dorme" após 15min sem uso | Primeira requisição demora ~30s para acordar |
| 750h/mês de compute | Suficiente para uso normal (31 dias × 24h = 744h) |
| Static Site | Sem limitação |

**Solução para o "sleep":** Configure um serviço de ping gratuito como **UptimeRobot** (uptimerobot.com) para fazer um request a cada 14 minutos para `https://tasky-backend.onrender.com/api/health` — o backend nunca vai dormir.

---

## Integração com NoteDex (futuro)

Quando quiser conectar o Tasky ao NoteDex:
1. No Tasky: vá em Perfil → "Conectar NoteDex" → cole seu token JWT
2. No NoteDex: os itens do Tasky aparecerão automaticamente no grafo
3. Você poderá referenciar notas do NoteDex dentro de itens do Tasky
