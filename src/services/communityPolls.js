function communityPollPayload({ question, answers, duration = 24, allowMultiselect = false }) {
  const cleanQuestion = String(question || '').trim().slice(0, 300);
  const cleanAnswers = [...new Set((answers || []).map((answer) => String(answer || '').trim()).filter(Boolean))]
    .slice(0, 10);
  if (cleanQuestion.length < 5) throw new Error('La question doit contenir au moins 5 caractères.');
  if (cleanAnswers.length < 2) throw new Error('Le sondage doit proposer au moins deux réponses différentes.');
  return {
    poll: {
      question: { text: cleanQuestion },
      answers: cleanAnswers.map((text) => ({ text: text.slice(0, 55) })),
      duration: Math.min(Math.max(Number(duration) || 24, 1), 168),
      allowMultiselect: Boolean(allowMultiselect),
    },
    allowedMentions: { parse: [] },
  };
}

module.exports = { communityPollPayload };
