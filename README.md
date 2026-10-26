# PRVIEW

Seus pull requests abertos, do mais antigo ao mais recente. Um painel para deixar na TV, perceber o que está parado e acompanhar revisões e verificações do GitHub.

**Instalação própria · configuração por `.env` · acesso por link · Node.js 24 · zero dependências de execução**

O usuário monitorado é configurável. `samirhvbr` é apenas o valor inicial do exemplo; cada instalação usa suas próprias credenciais e seu próprio token de acesso.

## Começar

Requer [Node.js 24 ou superior](https://nodejs.org/) e Git.

```sh
git clone https://github.com/samirhvbr/prview.git
cd prview
npm run setup
```

O assistente cria um `.env` ignorado pelo Git e gera um `DASHBOARD_TOKEN` aleatório. Edite esse arquivo e preencha `GITHUB_TOKEN`; altere `GITHUB_USERNAME` para o autor desejado. Se já existir um `.env`, preserve sua configuração e edite-o diretamente.

```sh
npm start
```

Abra no navegador, substituindo o marcador pelo **token do painel** do seu `.env`:

```text
http://localhost:3000/?token=SEU_DASHBOARD_TOKEN
```

Não é necessário `npm install`: o servidor usa os módulos nativos do Node.js, e a interface não precisa de compilação.

## Na TV

O link autoriza o navegador sem tela de login. O servidor cria um cookie e redireciona para uma URL sem o token, preservando as opções de exibição válidas. Guarde o link original para configurar outra TV ou reautorizar um navegador que tenha perdido os cookies.

- A lista permanece ordenada pela data de criação, da mais antiga para a mais recente.
- As páginas alternam automaticamente; é possível pausar e navegar manualmente.
- A tela inteira recarrega a cada 2 minutos, preservando a posição da página e as opções do link.
- O modo TV prioriza a leitura à distância, e o botão de tela cheia usa o recurso do navegador.
- Pesquisa e filtros ajudam a localizar um repositório ou estado de revisão.
- Revisões, verificações, rascunhos, idade do PR e última atividade ajudam a identificar pendências.
- A última consulta bem-sucedida continua visível se o GitHub falhar, acompanhada de um aviso de dados desatualizados.

Tela cheia exige uma interação do usuário em muitos navegadores; um parâmetro GET não consegue ativá-la de forma confiável. Para uma TV dedicada, configure o navegador ou dispositivo para iniciar em modo quiosque com o link original. O computador que executa o servidor precisa continuar ligado.

### Configurar a exibição pelo link

Monte um link para cada TV com os parâmetros GET abaixo. Eles podem ser combinados com `&` e também funcionam sem `token` em um navegador já autorizado. Valores inválidos são ignorados; parâmetros não reconhecidos não alteram o painel.

| Parâmetro | Valores | Efeito |
| --- | --- | --- |
| `token` | Seu `DASHBOARD_TOKEN` | Autoriza o navegador; é retirado da URL após a troca por cookie |
| `tv` | `1` ou `0` | Liga ou desliga o modo TV, prevalecendo sobre a preferência salva no navegador |
| `rotate` | `1` ou `0` | Liga ou pausa a rotação automática das páginas |
| `page_seconds` | Inteiro de `5` a `300` | Substitui `PAGE_SECONDS` apenas para a rotação nesse navegador |
| `reload_seconds` | `0` ou inteiro de `30` a `86400` | Intervalo para recarregar a página inteira; padrão `120` segundos em qualquer modo, `0` desativa |
| `page_size` | Inteiro de `1` a `20` | Fixa quantos PRs aparecem por página; sem ele, o tamanho é calculado conforme a tela |
| `repo` | `proprietario/repositorio` | Filtra pelo nome completo e exato do repositório |
| `status` | `attention`, `review`, `approved` ou `draft` | Filtra pelo estado descrito abaixo |
| `q` | Texto de até `200` caracteres | Busca no título, repositório e número do PR |

`attention` mostra PRs com ajustes solicitados, verificações com falha ou conflitos. `review` mostra PRs fora de rascunho que aguardam revisão; `approved`, os aprovados fora de rascunho; `draft`, os rascunhos. Os filtros se combinam e continuam ativos no modo TV, com um resumo visível, mesmo quando os controles ficam ocultos. A ordem permanece sempre do mais antigo ao mais recente.

TV com rotação a cada 20 segundos, 8 PRs por página e recarga completa a cada 2 minutos:

```text
http://localhost:3000/?token=SEU_DASHBOARD_TOKEN&tv=1&rotate=1&page_seconds=20&page_size=8&reload_seconds=120
```

TV pausada, mostrando apenas pendências de um repositório:

```text
http://localhost:3000/?token=SEU_DASHBOARD_TOKEN&tv=1&rotate=0&repo=owner%2Frepo&status=attention
```

Busca por texto, com espaço codificado como `%20`:

```text
http://localhost:3000/?token=SEU_DASHBOARD_TOKEN&q=fix%20timeout
```

Depois de autorizar o primeiro exemplo, o endereço fica `/?tv=1&rotate=1&page_seconds=20&page_size=8&reload_seconds=120`. Apenas o token sai; as opções válidas permanecem. Codifique caracteres especiais nos valores, como `/` em `repo` (`%2F`) e espaços em `q` (`%20`).

Os três intervalos têm funções distintas: `page_seconds` alterna as páginas da lista, `reload_seconds` recarrega o documento no navegador e `REFRESH_SECONDS` controla o cache e as consultas ao GitHub no servidor. Recarregar a tela não força uma consulta fora desse intervalo. O índice da página é guardado em `sessionStorage` para retomar a posição após a recarga; os dados dos PRs não são persistidos ali. As opções GET continuam na URL.

Para desligar o modo TV mesmo que ele esteja salvo no navegador, use `tv=0`. Sem `tv` na URL, vale a preferência local. Apagar os dados do site no navegador remove essa preferência e também pode remover a sessão; nesse caso, reabra o link original com token.

As opções do link mudam somente a apresentação. Não alteram o autor configurado, as permissões nem o intervalo de consulta ao GitHub: `REFRESH_SECONDS` continua definido no servidor. **Nunca use `GITHUB_TOKEN` na URL.** Filtros não restringem o acesso aos outros PRs; quem está autorizado pode remover os filtros e ver o painel completo.

## Dois tokens, duas funções

| Configuração | Função | Onde fica |
| --- | --- | --- |
| `GITHUB_TOKEN` | Ler os PRs que o GitHub permite consultar | Somente no servidor |
| `DASHBOARD_TOKEN` | Autorizar a visualização do painel | Servidor e link entregue à TV |

**Nunca coloque o token do GitHub no link da TV.** Qualquer pessoa com o link do painel poderá ver todos os dados apresentados por aquela instalação, inclusive nomes e títulos de repositórios privados acessíveis ao token do GitHub.

### Permissões no GitHub

Prefira um personal access token dedicado, com prazo de validade e o menor acesso necessário. Tokens fine-grained incluem leitura de repositórios públicos. Para privados, selecione o proprietário e os repositórios corretos e conceda leitura de pull requests e dos dados de commits necessários. A aprovação da organização ou autorização SSO pode ser necessária. Consulte a [autenticação GraphQL](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql) e o [gerenciamento de tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

A cobertura depende das permissões: o painel lista os PRs visíveis ao token. Um token fine-grained é limitado a um proprietário e tem restrições, incluindo cenários envolvendo múltiplas organizações e APIs de checks. Não presuma que todos os repositórios privados ou todas as verificações serão acessíveis. Se usar um token classic por necessidade de cobertura, revise cuidadosamente seus escopos e a política da organização; PRVIEW não precisa de permissões administrativas nem realiza alterações no GitHub.

Dados ausentes ou verificações indisponíveis não significam aprovação. Erros na consulta não substituem a última lista completa por uma lista parcial.

## Configuração

Variáveis de ambiente do processo têm precedência sobre o `.env`. Reinicie o servidor após alterar a configuração.

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `GITHUB_USERNAME` | `samirhvbr` no exemplo | Autor cujos PRs abertos serão consultados; obrigatório |
| `GITHUB_TOKEN` | — | Credencial GitHub; obrigatória |
| `DASHBOARD_TOKEN` | Gerado no setup | Segredo independente com 32–256 caracteres: letras, números, `_` ou `-` |
| `HOST` | `127.0.0.1` | Interface de escuta do servidor |
| `PORT` | `3000` | Porta HTTP, de 1 a 65535 |
| `REFRESH_SECONDS` | `120` | Intervalo mínimo entre consultas ao GitHub, de 30 a 86400 segundos |
| `PAGE_SECONDS` | `20` | Intervalo entre páginas, de 5 a 300 segundos |
| `STALE_DAYS` | `7` | Dias sem atividade para destaque de PR parado, de 1 a 365 |
| `COOKIE_SECURE` | `false` | Use `true` quando o endereço acessado pelo navegador for HTTPS |
| `BIND_ADDRESS` | `127.0.0.1` | Apenas no Compose: interface do host que publica a porta |

O cache é compartilhado entre as TVs. As atualizações são periódicas, conforme a demanda dos navegadores, e não representam eventos em tempo real. Limites do GitHub e falhas de rede podem adiar a próxima consulta; o painel informa a situação. O cache fica em memória e é perdido ao reiniciar.

A primeira leitura percorre todas as páginas antes de mostrar os dados e pode levar cerca de um minuto em contas com muitos PRs. A coleta reduz o tamanho das páginas quando o GitHub não consegue processá-las a tempo.

## Docker

Prepare o `.env` com o setup ou copie `.env.example`, preencha `GITHUB_TOKEN` e gere um `DASHBOARD_TOKEN` seguro. Com Docker e o plugin Compose instalados:

```sh
docker compose up -d --build
```

O exemplo publica `127.0.0.1:3000` e roda como usuário sem privilégios. `.env` não entra na imagem. A porta interna é sempre `3000`; `PORT` altera a porta publicada no host.

Para alcançar a TV pela rede local, configure `BIND_ADDRESS` com o IP LAN do computador e permita a porta no firewall. Em execução direta com Node, use `HOST` com o IP LAN ou `0.0.0.0`. Abra o endereço do servidor na TV; `localhost` na TV aponta para a própria TV.

Para publicação, coloque um proxy HTTPS na frente do serviço, configure `COOKIE_SECURE=true` e mantenha a porta do aplicativo acessível apenas ao proxy ou à rede apropriada. O aplicativo serve HTTP; essa variável protege o cookie, mas não cria um certificado nem configura TLS. Sem HTTPS, mantenha `COOKIE_SECURE=false` apenas em desenvolvimento local ou em uma rede de confiança.

```sh
docker compose logs --tail=100 prview
docker compose down
```

`GET /healthz` indica somente que o servidor HTTP está respondendo. Não valida a credencial, o acesso ao GitHub nem a atualidade dos dados.

## Acesso e privacidade

O token da URL é uma credencial de portador. A troca por cookie reduz sua permanência na barra de endereço; ela não remove cópias de históricos, favoritos, capturas de tela ou logs intermediários. Use HTTPS, evite registrar query strings no proxy e compartilhe o link apenas com quem deve ver o painel. Os recursos da interface são servidos localmente, sem CDN, fontes remotas ou analytics.

O cookie é `HttpOnly`, `SameSite=Lax` e válido por 30 dias, renovado enquanto o navegador consulta o painel. `Lax` permite abrir o link a partir de outro site e concluir o redirecionamento de autorização. Com `COOKIE_SECURE=true`, também usa `Secure`. Para revogar todos os links e sessões, gere outro `DASHBOARD_TOKEN`, atualize o `.env` e reinicie o servidor. Todos os espectadores usam o mesmo nível de acesso; crie instâncias separadas para públicos diferentes.

Mais detalhes em [SECURITY.md](SECURITY.md).

## Desenvolvimento

```sh
npm run dev
npm run check
npm test
```

Os testes usam dados simulados; não precisam de token nem consultam o GitHub. O CI verifica a sintaxe, executa os testes e constrói a imagem Docker.

```text
server/     configuração, sessão, HTTP, GitHub e cache
public/     interface, estilos e ícone
scripts/    preparação local e verificação de sintaxe
test/       testes com node:test
```

A coleta usa a conexão [`User.pullRequests`](https://docs.github.com/en/graphql/reference/users#user), com estado `OPEN`, paginação por cursor e ordenação `CREATED_AT ASC`. Não usa o endpoint de busca, portanto não depende do limite de 1.000 resultados da busca. A aplicação faz apenas leituras: não aprova, fecha nem faz merge de PRs.

### Problemas comuns

| Situação | Verificação |
| --- | --- |
| Acesso restrito | Reabra o link original com `DASHBOARD_TOKEN`; confirme se o servidor foi reiniciado após uma troca |
| Acesso falha após o redirecionamento | Verifique cookies do navegador e se `COOKIE_SECURE=true` está sendo usado somente com HTTPS |
| GitHub indisponível ou sem acesso | Verifique validade, permissões, proprietário do token e aprovação/SSO da organização |
| PR privado não aparece | Confirme se o token consegue ler o repositório; o painel não amplia suas permissões |
| Mudanças demoram a aparecer | Consulte a última atualização; o cache e os limites da API podem adiar uma coleta |
| TV não alcança o servidor | Use o IP/nome do servidor, revise `HOST` ou `BIND_ADDRESS` e o firewall |

## English

PRVIEW is a self-hosted wallboard for one GitHub user's open pull requests, ordered oldest first. It includes automatic page rotation, fullscreen, filters, review/check status, and a last-known-good snapshot during upstream outages.

Use Node.js 24+, clone the repository, run `npm run setup`, and edit `.env`. Set `GITHUB_USERNAME` and a dedicated `GITHUB_TOKEN` with the read access you need. Run `npm start`, then open `http://localhost:3000/?token=YOUR_DASHBOARD_TOKEN`. No install or build step is required. Docker Compose is also included.

Configure each display through its URL, for example `/?token=YOUR_DASHBOARD_TOKEN&tv=1&rotate=1&page_seconds=20&page_size=8&reload_seconds=120`. Supported options are `tv=1|0`, `rotate=1|0`, `page_seconds=5..300`, `page_size=1..20`, `reload_seconds=0|30..86400`, `repo=owner/name`, `status=attention|review|approved|draft`, and `q` with up to 200 characters. Invalid values are ignored. The token exchange preserves valid display options and removes the token. URL filters remain active in TV mode; they are display preferences, not access restrictions. `tv=0` overrides a saved TV preference. Native fullscreen still needs a browser gesture, so configure kiosk mode at the browser or OS level for unattended startup.

The browser reloads the full page every 120 seconds by default in all modes; use `reload_seconds=0` to disable it. The page index is retained in `sessionStorage`, without storing PR data. This is separate from page rotation (`page_seconds`) and the server's GitHub refresh interval (`REFRESH_SECONDS`); a document reload does not bypass the server cache.

The GitHub token stays on the server. The independent dashboard token exchanges for an HTTP-only session cookie; anyone holding that link can read the complete configured board, including visible private PR metadata. Use HTTPS and `COOKIE_SECURE=true` for hosting, avoid query-string logging, and rotate the dashboard token to revoke all sessions. GitHub permissions and API limits determine coverage and refresh availability.

Licensed under [MIT](LICENSE).
