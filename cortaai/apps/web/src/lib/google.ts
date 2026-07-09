// Google Sign-In via GIS (Google Identity Services), 100% client-side.
//
// O site roda como export estático no GitHub Pages, sem backend em runtime.
// Por isso o login com Google acontece inteiramente no navegador: o GIS
// devolve um ID token (JWT assinado pelo Google) e nós o decodificamos aqui
// para extrair nome/e-mail/foto reais do usuário.
//
// Configuração: defina NEXT_PUBLIC_GOOGLE_CLIENT_ID no build para ativar o
// botão real do Google. Sem a env, googleEnabled() retorna false e a UI cai
// no login de demonstração (nunca um botão morto).

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

/** true quando há um Client ID configurado (habilita o fluxo real do Google). */
export function googleEnabled(): boolean {
  return !!GOOGLE_CLIENT_ID;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

/**
 * Decodifica o payload de um ID token (JWT) do Google no navegador.
 * base64url-decode + UTF-8, sem dependência externa. Lança em token inválido.
 * NÃO valida a assinatura (isso caberia ao backend); serve para ler o perfil.
 */
export function decodeGoogleJwt(idToken: string): GoogleProfile {
  const parts = idToken.split(".");
  if (parts.length < 2) throw new Error("ID token do Google inválido");

  // base64url → base64 + padding
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");

  // atob devolve uma "binary string"; convertemos p/ bytes e decodificamos
  // como UTF-8 para preservar acentos/emojis em nomes (ex.: "João Gonçalves").
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  const payload = JSON.parse(json) as Partial<GoogleProfile> & Record<string, unknown>;

  return {
    sub: String(payload.sub ?? ""),
    email: String(payload.email ?? ""),
    name: String(payload.name ?? ""),
    picture: String(payload.picture ?? ""),
  };
}

// ---------------------------------------------------------------- GIS loader + tipos

interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
}

interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "small" | "medium" | "large";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill" | "circle" | "square";
      width?: number | string;
      locale?: string;
      logo_alignment?: "left" | "center";
    },
  ): void;
  prompt(): void;
  disableAutoSelect(): void;
}

interface GoogleAccounts {
  id: GoogleIdApi;
}

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts };
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";
let gisPromise: Promise<void> | null = null;

/**
 * Injeta o script oficial do Google Identity Services uma única vez.
 * Este é o ÚNICO script externo do app e é exigido pelo Google para o
 * fluxo de login (não há como fazer OAuth do Google sem ele). Resolve
 * quando window.google.accounts.id estiver disponível.
 */
export function loadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisPromise) return gisPromise;

  gisPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const onReady = () => {
      if (window.google?.accounts?.id) resolve();
      else reject(new Error("GIS carregou mas a API não ficou disponível"));
    };
    if (existing) {
      if (window.google?.accounts?.id) resolve();
      else existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar o GIS")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", onReady, { once: true });
    script.addEventListener("error", () => reject(new Error("Falha ao carregar o GIS")), { once: true });
    document.head.appendChild(script);
  });
  return gisPromise;
}

/** Inicializa o GIS com o callback que recebe o ID token (JWT) real. */
export function initGoogle(onCredential: (idToken: string) => void): void {
  if (!window.google?.accounts?.id) throw new Error("GIS não carregado");
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (response) => onCredential(response.credential),
    cancel_on_tap_outside: true,
  });
}

/** Renderiza o botão oficial do Google dentro do elemento informado. */
export function renderGoogleButton(el: HTMLElement, opts?: { width?: number }): void {
  if (!window.google?.accounts?.id) throw new Error("GIS não carregado");
  window.google.accounts.id.renderButton(el, {
    theme: "filled_black",
    size: "large",
    text: "continue_with",
    shape: "pill",
    logo_alignment: "center",
    locale: "pt-BR",
    width: opts?.width ?? 360,
  });
}

/** One Tap opcional — exibe o prompt do Google se disponível. */
export function promptGoogle(): void {
  window.google?.accounts?.id?.prompt();
}

/** base64url-encode UTF-8 (contraparte do decode, para o token de demonstração). */
function base64UrlEncodeUtf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Gera um ID token (JWT) DE DEMONSTRAÇÃO, decodificável por decodeGoogleJwt.
 * Usado apenas no fallback sem Client ID — não é assinado nem válido no Google.
 * Cria um perfil de exemplo variado para o modo demo não ser sempre o mesmo.
 */
export function demoGoogleIdToken(): string {
  const nth = Math.floor(Math.random() * DEMO_PROFILES.length);
  const p = DEMO_PROFILES[nth];
  const header = base64UrlEncodeUtf8(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = base64UrlEncodeUtf8(
    JSON.stringify({
      sub: `demo-${Date.now()}-${nth}`,
      email: p.email,
      name: p.name,
      picture: "",
      iss: "cortaai-demo",
    }),
  );
  return `${header}.${payload}.`;
}

const DEMO_PROFILES = [
  { name: "João Gonçalves", email: "joao.goncalves@gmail.com" },
  { name: "Ana Beatriz Souza", email: "ana.souza@gmail.com" },
  { name: "Lucas Ferreira", email: "lucas.ferreira@gmail.com" },
  { name: "Camila Nogueira", email: "camila.nogueira@gmail.com" },
];
