const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const GOLD = "#c9a961";
const DARK = "#1a1a1a";
const MUTED = "#555";
const LIGHT = "#888";

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 60, bottom: 60, left: 60, right: 60 },
  bufferPages: true,
  info: {
    Title: "Contrato de Prestação de Serviços — Jean Izidoro",
    Author: "Thiago Fregolão",
    Subject: "Desenvolvimento e Licenciamento de Software",
  },
});

const outputPath = path.join(__dirname, "..", "CONTRATO_JEAN_IZIDORO.pdf");
doc.pipe(fs.createWriteStream(outputPath));

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function h1(text) {
  ensureSpace(90);
  doc.moveDown(0.3);
  doc
    .fillColor(DARK)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(text, { align: "left" });
  doc
    .moveTo(60, doc.y + 1)
    .lineTo(535, doc.y + 1)
    .strokeColor(GOLD)
    .lineWidth(0.5)
    .stroke();
  doc.moveDown(0.4);
}

function p(text, opts = {}) {
  doc
    .fillColor(DARK)
    .font("Helvetica")
    .fontSize(10)
    .text(text, { align: "justify", lineGap: 1.5, ...opts });
  doc.moveDown(0.25);
}

function bullet(text) {
  doc
    .fillColor(DARK)
    .font("Helvetica")
    .fontSize(10)
    .text("•  " + text, { indent: 10, lineGap: 1.5 });
  doc.moveDown(0.15);
}

function subtitle(text) {
  doc.moveDown(0.15);
  doc
    .fillColor(DARK)
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .text(text);
  doc.moveDown(0.15);
}

function spacer(n = 1) {
  doc.moveDown(n);
}

function ensureSpace(minSpace = 80) {
  if (doc.y > doc.page.height - minSpace - 60) {
    doc.addPage();
  }
}

// ─────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────
doc
  .fillColor(DARK)
  .font("Helvetica-Bold")
  .fontSize(22)
  .text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", { align: "center" });
doc
  .fillColor(GOLD)
  .font("Helvetica")
  .fontSize(11)
  .text("DESENVOLVIMENTO E LICENCIAMENTO DE SOFTWARE", {
    align: "center",
    characterSpacing: 2,
  });

doc.moveDown(0.3);
doc
  .moveTo(180, doc.y)
  .lineTo(415, doc.y)
  .strokeColor(GOLD)
  .lineWidth(1)
  .stroke();
doc.moveDown(1.5);

// ─────────────────────────────────────────────
// Cláusula 1
// ─────────────────────────────────────────────
h1("CLÁUSULA 1ª — DAS PARTES");

subtitle("CONTRATANTE");
p(
  "JEAN IZIDORO, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 28.722.350/0001-80, com sede à Rua São Paulo, nº 251, Centro, Andirá — PR, doravante denominada CONTRATANTE."
);

subtitle("CONTRATADO");
p(
  "THIAGO FREGOLÃO, profissional autônomo, inscrito no CPF sob o nº 046.991.679-69, residente e domiciliado em Katue — Paraguai, doravante denominado CONTRATADO."
);

// ─────────────────────────────────────────────
// Cláusula 2
// ─────────────────────────────────────────────

h1("CLÁUSULA 2ª — DO OBJETO");
p(
  "O presente contrato tem por objeto o desenvolvimento, entrega e licenciamento de uso de sistema digital personalizado para gestão de leads, relacionamento com clientes (CRM), atendimento automatizado via WhatsApp com inteligência artificial, e landing page institucional, customizado para a operação de arquitetura e eventos do CONTRATANTE."
);

// ─────────────────────────────────────────────
// Cláusula 3
// ─────────────────────────────────────────────

h1("CLÁUSULA 3ª — DO ESCOPO DOS SERVIÇOS ENTREGUES (SETUP)");
p(
  "O CONTRATADO entrega ao CONTRATANTE o seguinte escopo, integralmente desenvolvido e em operação:"
);

subtitle("3.1 Design e Desenvolvimento de Interface");
bullet("Landing page institucional premium, com animações cinematográficas, hospedada em domínio próprio");
bullet("Design exclusivo, responsivo e otimizado para performance");
bullet("Sistema de roteamento, identidade visual e copywriting");

subtitle("3.2 Sistema CRM Administrativo");
bullet("Painel administrativo com autenticação restrita");
bullet("Gestão de leads em funil por temperatura (quentes, mornos, frios, em atendimento, fechados)");
bullet("Inbox unificado de conversas de WhatsApp");
bullet("Modal de atendimento com workflow de 4 etapas (ficha, proposta, contrato, acompanhamento)");
bullet("Modo Reunião (fullscreen) para uso presencial com clientes");
bullet("Dashboard de saúde do sistema com monitoramento de erros em tempo real");
bullet("Gerenciamento de contatos VIP (lista de exceção da IA)");
bullet("Configurador de persona e regras da IA");


subtitle("3.3 Agente de Inteligência Artificial");
bullet("Assistente virtual integrada ao WhatsApp do CONTRATANTE, com atendimento 24/7");
bullet("Respostas humanizadas distribuídas em 2 a 3 mensagens");
bullet("Detecção automática de tom (formal, casual, misto) com adaptação dinâmica");
bullet("Memória persistente por lead via dossiê estruturado");
bullet("Transcrição automática de mensagens de áudio");
bullet("Classificação automática de leads em tempo real");
bullet("Sistema de pausa temporária com retomada automática quando operador humano assume a conversa");
bullet("Auto-resposta configurável fora do horário comercial");

subtitle("3.4 Integrações de Mensageria e Agenda");
bullet("Integração com provedor Z-API para envio e recebimento de mensagens via WhatsApp");
bullet("Integração com Google Calendar para consulta de disponibilidade e sincronização de compromissos");

subtitle("3.5 Sistema de Contratos");
bullet("Geração automatizada de contratos em PDF a partir dos dados do atendimento");
bullet("Integração com Autentique para envio e assinatura digital");
bullet("Acompanhamento de status em tempo real (enviado, visto, assinado)");

subtitle("3.6 Camadas de Confiabilidade");
bullet("Retry com exponential backoff em todas as chamadas externas");
bullet("Circuit breaker automático em caso de falhas consecutivas");
bullet("Validador anti-alucinação de respostas");
bullet("Alertas automáticos ao operador em caso de falhas críticas");
bullet("Logs estruturados de todos os eventos");

// ─────────────────────────────────────────────
// Cláusula 4
// ─────────────────────────────────────────────

h1("CLÁUSULA 4ª — DA TECNOLOGIA EMPREGADA");
p(
  "O sistema foi construído com as seguintes tecnologias, de propriedade do CONTRATADO ou de terceiros licenciados:"
);
bullet("Frontend: Next.js, React, TypeScript, Tailwind CSS, GSAP, Lenis, Framer Motion");
bullet("Backend: Next.js API Routes (Node.js), TypeScript");
bullet("Banco de dados: PostgreSQL com Prisma ORM");
bullet("Infraestrutura de hospedagem: Railway");
bullet("Modelos de linguagem: Anthropic Claude (Sonnet e Haiku)");
bullet("Transcrição de áudio: Groq Whisper");
bullet("Integração WhatsApp: Z-API (plano Ultimate)");
bullet("Assinatura digital: Autentique");
bullet("Controle de versão: Git / GitHub");

// ─────────────────────────────────────────────
// Cláusula 5
// ─────────────────────────────────────────────

h1("CLÁUSULA 5ª — DOS SERVIÇOS CONTÍNUOS (MANUTENÇÃO E LICENCIAMENTO)");
p(
  "Mediante o pagamento da mensalidade prevista na Cláusula 6ª, o CONTRATADO prestará os seguintes serviços de forma contínua:"
);
bullet("Licença de uso do sistema desenvolvido, em regime exclusivo para o CONTRATANTE");
bullet("Manutenção corretiva (correção de bugs e falhas)");
bullet("Atualizações de segurança das dependências e infraestrutura");
bullet("Tuning e ajustes da inteligência artificial conforme feedback do CONTRATANTE");
bullet("Monitoramento do sistema e resposta a incidentes");
bullet("Backups automáticos diários do banco de dados");
bullet("Suporte técnico via WhatsApp em horário comercial (08h às 18h, dias úteis)");
bullet("Custeio dos serviços de terceiros necessários ao funcionamento (Anthropic Claude, Groq Whisper, Autentique), exceto Z-API que é contratado diretamente pelo CONTRATANTE");

subtitle("5.1 Não incluso na mensalidade");
bullet("Desenvolvimento de novas funcionalidades (cobradas em projeto separado, conforme escopo)");
bullet("Recuperação de dados perdidos por ação do CONTRATANTE");
bullet("Suporte fora do horário comercial (emergências avaliadas caso a caso)");
bullet("Migração de domínio ou infraestrutura para terceiros");

// ─────────────────────────────────────────────
// Cláusula 6
// ─────────────────────────────────────────────

h1("CLÁUSULA 6ª — DO VALOR E CONDIÇÕES DE PAGAMENTO");

subtitle("6.1 Valor do Setup (entrega inicial)");
p(
  "Pela entrega completa do escopo descrito na Cláusula 3ª, o CONTRATANTE pagará ao CONTRATADO o valor total de R$ 5.200,00 (cinco mil e duzentos reais), dividido da seguinte forma:"
);
bullet(
  "50% (cinquenta por cento), equivalente a R$ 2.600,00 (dois mil e seiscentos reais), pagos na assinatura deste contrato, a título de sinal e início dos trabalhos"
);
bullet(
  "50% (cinquenta por cento), equivalente a R$ 2.600,00 (dois mil e seiscentos reais), pagos após a entrega completa do escopo e respectiva aprovação formal pelo CONTRATANTE"
);
p(
  "Forma de pagamento: PIX ou transferência bancária, conforme dados informados pelo CONTRATADO. Considera-se aprovação formal a confirmação por escrito (mensagem de WhatsApp, e-mail ou outro meio verificável) do CONTRATANTE atestando que o escopo foi recebido e está em funcionamento conforme acordado."
);

subtitle("6.2 Mensalidade");
p(
  "Pelos serviços contínuos descritos na Cláusula 5ª, o CONTRATANTE pagará ao CONTRATADO o valor mensal de R$ 199,00 (cento e noventa e nove reais), reajustáveis anualmente conforme IPCA ou índice equivalente, mediante acordo entre as partes."
);
p("Vencimento: todo dia 10 (dez) de cada mês, a partir da data de assinatura.");

subtitle("6.3 Inadimplência");
p(
  "Atraso superior a 10 (dez) dias no pagamento da mensalidade poderá acarretar suspensão dos serviços mediante notificação prévia, sem prejuízo das demais medidas legais cabíveis."
);

// ─────────────────────────────────────────────
// Cláusula 7
// ─────────────────────────────────────────────

h1("CLÁUSULA 7ª — DO PRAZO DE VIGÊNCIA");
p("7.1 O presente contrato tem vigência indeterminada a partir da data de assinatura.");
p("7.2 Renovação automática mensal mediante o pagamento da mensalidade.");
p(
  "7.3 Qualquer das partes poderá rescindir o contrato mediante aviso prévio de 30 (trinta) dias, sem ônus, desde que estejam quitadas todas as mensalidades vencidas até a data da rescisão."
);

// ─────────────────────────────────────────────
// Cláusula 8
// ─────────────────────────────────────────────

h1("CLÁUSULA 8ª — DA PROPRIEDADE INTELECTUAL");
p(
  "8.1 Todo o código-fonte, arquitetura, scripts, prompts de IA, designs e configurações desenvolvidos neste projeto são de propriedade intelectual exclusiva do CONTRATADO, nos termos da Lei nº 9.609/98."
);
p(
  "8.2 Ao CONTRATANTE é concedida licença de uso exclusiva e não-transferível do sistema, condicionada ao pagamento regular da mensalidade."
);
p("8.3 Em caso de rescisão contratual:");
bullet(
  "Os dados comerciais do CONTRATANTE (leads, contatos, conversas, contratos) permanecem de sua propriedade e serão exportados em formato aberto (CSV/JSON) e entregues em até 15 dias úteis após a rescisão"
);
bullet("O acesso ao sistema é encerrado");
bullet("O código-fonte permanece com o CONTRATADO");
p(
  "8.4 O CONTRATANTE não poderá copiar, redistribuir, sublicenciar ou fazer engenharia reversa do sistema."
);
p(
  "8.5 Permanecem de propriedade e controle do CONTRATANTE: o domínio contratado em seu nome, a conta Z-API vinculada ao seu número de WhatsApp, e todos os dados comerciais registrados na plataforma."
);

// ─────────────────────────────────────────────
// Cláusula 9
// ─────────────────────────────────────────────

h1("CLÁUSULA 9ª — DA CONFIDENCIALIDADE");
p("9.1 Ambas as partes comprometem-se a manter absoluto sigilo sobre:");
bullet("Dados comerciais, clientes, propostas e contratos do CONTRATANTE");
bullet("Credenciais, arquitetura técnica e segredos industriais do CONTRATADO");
bullet("Toda informação técnica ou comercial trocada durante a execução do contrato");
p(
  "9.2 Esta cláusula vigora durante a vigência do contrato e por 2 (dois) anos após sua rescisão."
);

// ─────────────────────────────────────────────
// Cláusula 10
// ─────────────────────────────────────────────

h1("CLÁUSULA 10ª — DA LIMITAÇÃO DE RESPONSABILIDADE");
p(
  "10.1 O CONTRATADO compromete-se a envidar todos os esforços técnicos razoáveis para manter o sistema em pleno funcionamento. Contudo, o CONTRATANTE reconhece e aceita as seguintes limitações inerentes à natureza do produto:"
);

subtitle("10.2 Respostas da Inteligência Artificial");
bullet(
  "O sistema utiliza modelos de linguagem que podem, eventualmente, gerar respostas inesperadas ou imprecisas"
);
bullet(
  "O CONTRATADO implementou camadas de validação e controle de qualidade, porém não garante 100% de acerto nas respostas geradas pela IA"
);
bullet(
  "O CONTRATANTE é responsável por revisar periodicamente a qualidade das interações e reportar anomalias"
);

subtitle("10.3 Integração com WhatsApp via Z-API");
bullet(
  "A integração com WhatsApp é realizada por meio do provedor Z-API, conforme termos e políticas de uso da plataforma"
);
bullet(
  "Eventuais limitações de acesso ou restrições técnicas aplicadas à conta WhatsApp do CONTRATANTE são de responsabilidade do próprio CONTRATANTE, nos termos das políticas da plataforma"
);
bullet(
  "O CONTRATADO implementou boas práticas operacionais para garantir uma utilização responsável: controle de cadência de envio, gestão de contatos prioritários, janela configurável de horário de atendimento e possibilidade de pausa integral do sistema a qualquer momento"
);
bullet(
  "O CONTRATANTE permanece como titular e responsável pelo uso do número de WhatsApp conectado ao sistema"
);

subtitle("10.4 Indisponibilidade de terceiros");
p(
  "O CONTRATADO não responde por indisponibilidade de serviços de terceiros (Z-API, Anthropic, Groq, Autentique, Google, Railway), além de comunicar o CONTRATANTE e atuar na recuperação do serviço assim que restabelecido."
);

subtitle("10.5 Limite de responsabilidade financeira");
p(
  "A responsabilidade do CONTRATADO, em qualquer hipótese, fica limitada ao valor equivalente a 3 (três) mensalidades pagas pelo CONTRATANTE."
);

// ─────────────────────────────────────────────
// Cláusula 11
// ─────────────────────────────────────────────

h1("CLÁUSULA 11ª — DAS DISPOSIÇÕES GERAIS");
p("11.1 Este contrato substitui quaisquer acordos anteriores entre as partes sobre o mesmo objeto.");
p(
  "11.2 Alterações somente serão válidas mediante aditivo por escrito assinado por ambas as partes."
);
p(
  "11.3 A tolerância de uma parte quanto ao descumprimento de qualquer cláusula não constitui novação ou renúncia de direito."
);

// ─────────────────────────────────────────────
// Cláusula 12
// ─────────────────────────────────────────────

h1("CLÁUSULA 12ª — DO FORO");
p(
  "Fica eleito o foro da Comarca de Andirá — PR para dirimir quaisquer controvérsias decorrentes deste contrato, renunciando as partes a qualquer outro, por mais privilegiado que seja."
);

// ─────────────────────────────────────────────
// Fecho
// ─────────────────────────────────────────────

doc.moveDown(0.8);
// Reserva espaço pro fecho + assinaturas (aprox 180pt). Se não couber, vai pra próxima página.
ensureSpace(180);

doc
  .fillColor(DARK)
  .font("Helvetica")
  .fontSize(10)
  .text(
    "E, por estarem assim justas e contratadas, as partes assinam o presente contrato em 2 (duas) vias de igual teor e forma, ou digitalmente via plataforma Autentique, com validade jurídica equivalente nos termos da Lei 14.063/2020 e MP 2.200-2/2001.",
    { align: "justify", lineGap: 1.5 }
  );

doc.moveDown(0.8);
doc
  .fillColor(DARK)
  .font("Helvetica-Bold")
  .fontSize(10)
  .text("Andirá — PR, _____ de _________________ de 2026", { align: "center" });

// ─────────────────────────────────────────────
// Assinaturas
// ─────────────────────────────────────────────
doc.moveDown(1.2);
const signY = doc.y + 28;
doc
  .moveTo(80, signY)
  .lineTo(260, signY)
  .strokeColor(DARK)
  .lineWidth(0.5)
  .stroke();
doc
  .moveTo(335, signY)
  .lineTo(515, signY)
  .stroke();

doc
  .font("Helvetica-Bold")
  .fontSize(10)
  .fillColor(DARK)
  .text("CONTRATANTE", 80, signY + 8, { width: 180, align: "center" });
doc.text("CONTRATADO", 335, signY + 8, { width: 180, align: "center" });

doc
  .font("Helvetica")
  .fontSize(9)
  .fillColor(MUTED)
  .text("Jean Izidoro", 80, signY + 24, { width: 180, align: "center" });
doc.text("Thiago Fregolão", 335, signY + 24, { width: 180, align: "center" });

doc
  .fontSize(8)
  .fillColor(LIGHT)
  .text("CNPJ: 28.722.350/0001-80", 80, signY + 38, {
    width: 180,
    align: "center",
  });
doc.text("CPF: 046.991.679-69", 335, signY + 38, { width: 180, align: "center" });

// ─────────────────────────────────────────────
// Footer (centralizado manualmente pra não ativar flow control do pdfkit)
// ─────────────────────────────────────────────
const pages = doc.bufferedPageRange();
for (let i = 0; i < pages.count; i++) {
  doc.switchToPage(pages.start + i);
  doc.font("Helvetica").fontSize(8).fillColor(LIGHT);
  const footer = `Página ${i + 1} de ${pages.count}`;
  const textWidth = doc.widthOfString(footer);
  const x = (doc.page.width - textWidth) / 2;
  const y = doc.page.height - 35;
  doc.text(footer, x, y, { lineBreak: false });
}

doc.end();

// aguarda finalizar
process.on("exit", () => {
  console.log("\n✓ PDF gerado em:", outputPath);
});
