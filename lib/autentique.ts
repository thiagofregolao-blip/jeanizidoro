const API = "https://api.autentique.com.br/v2/graphql";

type SignerInput = { email?: string; phone?: string; name: string; action?: "SIGN" };

export async function createDocumentWithFile(args: {
  name: string;
  pdf: Buffer;
  signers: SignerInput[];
  message?: string;
}): Promise<{ id: string; publicUrl?: string; signers: unknown[] } | null> {
  const token = process.env.AUTENTIQUE_TOKEN;
  if (!token) throw new Error("AUTENTIQUE_TOKEN não configurado");

  const mutation = `
    mutation CreateDocumentMutation(
      $document: DocumentInput!,
      $signers: [SignerInput!]!,
      $file: Upload!
    ) {
      createDocument(
        sandbox: false,
        document: $document,
        signers: $signers,
        file: $file
      ) {
        id
        name
        refusable
        sortable
        files { original signed pades }
        signatures {
          public_id
          name
          email
          action { name }
          link { short_link }
        }
      }
    }
  `;

  const variables = {
    document: { name: args.name, message: args.message },
    signers: args.signers.map((s) => ({
      email: s.email,
      phone: s.phone,
      name: s.name,
      action: s.action || "SIGN",
      delivery_method: s.email ? "DELIVERY_METHOD_EMAIL" : "DELIVERY_METHOD_WHATSAPP",
    })),
    file: null,
  };

  const operations = JSON.stringify({ query: mutation, variables });
  const map = JSON.stringify({ "0": ["variables.file"] });

  const form = new FormData();
  form.append("operations", operations);
  form.append("map", map);
  form.append("0", new Blob([new Uint8Array(args.pdf)], { type: "application/pdf" }), `${args.name}.pdf`);

  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Autentique error ${res.status}: ${t}`);
  }
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const doc = json.data?.createDocument;
  if (!doc) return null;

  const publicUrl = doc.signatures?.[0]?.link?.short_link;
  return { id: doc.id, publicUrl, signers: doc.signatures || [] };
}

export async function getDocumentStatus(id: string) {
  const token = process.env.AUTENTIQUE_TOKEN;
  if (!token) throw new Error("AUTENTIQUE_TOKEN não configurado");
  const query = `
    query Doc($id: UUID!) {
      document(id: $id) {
        id
        name
        files { original signed pades }
        signatures {
          public_id
          name
          email
          signed { created_at }
          viewed { created_at }
        }
      }
    }
  `;
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { id } }),
  });
  if (!res.ok) throw new Error(`Autentique status ${res.status}`);
  const json = await res.json();
  return json.data?.document;
}
