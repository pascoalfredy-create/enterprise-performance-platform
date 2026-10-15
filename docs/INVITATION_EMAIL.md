# Convites por e-mail

O envio usa a API transacional Resend, chamado apenas pelo Worker, na criação de um convite e na ação explícita de reenvio. Não requer nova dependência npm nem migração de base de dados.

## Configuração no Worker Cloudflare

- `RESEND_API_KEY`: secret de envio, configurado diretamente na Cloudflare; nunca no Git nem no chat.
- `INVITATION_FROM_EMAIL`: remetente autorizado num domínio verificado no serviço, por exemplo `Enterprise Performance <convites@dominio-da-empresa>`.
- `PUBLIC_APP_URL`: origem HTTPS pública e confiável da plataforma, sem query, fragmento, credenciais ou caminho. Para esta instalação: `https://enterprise-performance-platform.pascoalfredy.workers.dev`.

A propriedade do domínio e os registos de autenticação de e-mail devem ser verificados no serviço antes de usar o remetente. O endereço Hotmail é o destinatário do convite; não é um domínio remetente controlado pela plataforma.

## Estados e limites

- Sem configuração: o convite fica preparado, mas a interface informa que nenhum e-mail foi enviado.
- Com resposta válida do serviço: a interface confirma apenas aceitação para envio, não receção na caixa de entrada.
- Falha ou timeout: o convite fica preparado e a interface informa a falha. Não há repetição automática; o administrador pode reenviar.
- Cada reenvio revoga a ligação anterior e gera uma nova. O prazo continua a ser de sete dias. Uma resposta de rede incerta pode corresponder a uma mensagem aceite pelo serviço; a interface não afirma sucesso sem confirmação.
- O token, a chave e respostas privadas do serviço não entram nos logs nem nas mensagens de erro.
- A UI mostra o acesso como aguardando aceitação, em vez de inferir entrega do antigo estado de base de dados `Convite enviado`.
- A entrega efetiva, bounces e reclamações não são monitorizados nesta alteração; exigem eventos/webhook verificados do fornecedor.

## Aceitação

1. Publicar a alteração e configurar as três variáveis.
2. Abrir Utilizadores e RBAC e reenviar o convite existente para o destinatário confirmado.
3. Confirmar aceitação pelo serviço e receção real na caixa do destinatário.
4. Entrar com o mesmo e-mail e aceitar o convite; conferir função e âmbito.

Os testes automatizados usam transporte simulado e não enviam mensagens reais.
