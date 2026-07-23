import { describe, expect, it } from "vitest";
import { parseSrt, toSrt } from "./srt";

const SAMPLE = `1
00:00:01,000 --> 00:00:03,500
Olá, mundo!

2
00:00:04,000 --> 00:00:06,000
Segunda <i>legenda</i>
em duas linhas
`;

describe("parseSrt", () => {
  it("parseia cues com índice, tempos e texto multi-linha", () => {
    const cues = parseSrt(SAMPLE);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ startMs: 1000, endMs: 3500, text: "Olá, mundo!" });
    expect(cues[1].startMs).toBe(4000);
    expect(cues[1].text).toBe("Segunda legenda\nem duas linhas"); // tags HTML removidas
  });

  it("aceita \\r\\n e blocos sem índice", () => {
    const cues = parseSrt("00:00:00,500 --> 00:00:01,000\r\nOi\r\n\r\n00:00:02.000 --> 00:00:03.000\r\nTchau\r\n");
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe("Oi");
    expect(cues[1].startMs).toBe(2000); // separador com ponto também
  });

  it("descarta cues inválidas (fim antes do início, sem texto)", () => {
    const cues = parseSrt("1\n00:00:05,000 --> 00:00:02,000\nInválida\n\n2\n00:00:01,000 --> 00:00:02,000\n\n");
    expect(cues).toHaveLength(0);
  });

  it("ordena por tempo de início", () => {
    const cues = parseSrt("1\n00:00:10,000 --> 00:00:11,000\nB\n\n2\n00:00:01,000 --> 00:00:02,000\nA\n");
    expect(cues.map((c) => c.text)).toEqual(["A", "B"]);
  });
});

describe("toSrt", () => {
  it("roundtrip parse → serialize → parse preserva os dados", () => {
    const cues = parseSrt(SAMPLE);
    const again = parseSrt(toSrt(cues));
    expect(again).toEqual(cues);
  });

  it("formata tempos com hora e milissegundos", () => {
    const out = toSrt([{ startMs: 3_661_042, endMs: 3_662_000, text: "X" }]);
    expect(out).toContain("01:01:01,042 --> 01:01:02,000");
  });
});
