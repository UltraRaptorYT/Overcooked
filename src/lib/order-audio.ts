type OrderAudioInput = {
  difficulty?: string | null;
  orderNo?: string | null;
};

export function getOrderAudioPath({ difficulty, orderNo }: OrderAudioInput) {
  if (!difficulty || !orderNo) return null;

  const safeDifficulty = difficulty.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const safeOrderNo = orderNo.replace(/[^a-z0-9_-]/gi, "");

  if (!safeDifficulty || !safeOrderNo) return null;

  return `/order-audio/${safeDifficulty}-${safeOrderNo}.wav`;
}
