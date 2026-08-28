// 브라우저가 Anthropic 을 직접 부르면 API 키가 그대로 노출된다.
// 그래서 키는 여기 서버에만 두고, 앱은 이 함수를 부른다.
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const Anthropic = require("@anthropic-ai/sdk");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// 앱이 올라가 있는 곳만 부를 수 있게 한다.
const ALLOWED = [
  "https://seoul-educaion.web.app",
  "https://seoul-educaion.firebaseapp.com",
  "http://localhost:5173",
];

exports.ai = onRequest(
  { secrets: [ANTHROPIC_API_KEY], region: "asia-northeast3", cors: ALLOWED, maxInstances: 10 },
  async (req, res) => {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ error: "POST 만 받습니다" });

    const parts = req.body && req.body.parts;
    if (!Array.isArray(parts) || parts.length === 0) {
      return res.status(400).json({ error: "parts 가 비었습니다" });
    }

    try {
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

      const message = await client.beta.messages.create({
        model: "claude-opus-5",
        max_tokens: 4000,
        output_config: { effort: "medium" },
        // 안전 분류기가 거절하면 다른 모델로 이어서 처리한다
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages: [{ role: "user", content: parts }],
      });

      if (message.stop_reason === "refusal") {
        return res.status(422).json({ error: "요청이 거절되었습니다" });
      }

      const raw = message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      // 모델이 ```json 울타리를 치는 경우가 있어 벗겨낸다
      const cleaned = raw.replace(/```json|```/g, "").trim();

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        console.error("JSON 파싱 실패", cleaned.slice(0, 500));
        return res.status(502).json({ error: "결과를 읽지 못했습니다" });
      }

      return res.json(parsed);
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) {
        return res.status(429).json({ error: "잠시 뒤에 다시 시도해 주세요" });
      }
      if (e instanceof Anthropic.AuthenticationError) {
        console.error("API 키가 잘못되었습니다", e.message);
        return res.status(500).json({ error: "서버 설정 문제입니다" });
      }
      console.error("Anthropic 호출 실패", e);
      return res.status(502).json({ error: "분석에 실패했습니다" });
    }
  },
);
