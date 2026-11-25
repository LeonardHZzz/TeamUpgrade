// Voz en español (Web Speech). Se puede apagar desde el botón del altavoz.
export const Voz = {
  activa: true,
  voz: null,
  elegir() {
    const voces = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    const es = voces.filter((v) => v.lang && v.lang.toLowerCase().startsWith("es"));
    const pref = ["es-PE", "es-419", "es-MX", "es-US", "es-ES"];
    this.voz =
      es.find((v) => /natural|online/i.test(v.name) && pref.includes(v.lang)) ||
      pref.map((l) => es.find((v) => v.lang === l)).find(Boolean) ||
      es[0] ||
      null;
  },
  decir(texto) {
    if (!this.activa || !window.speechSynthesis || !texto) return;
    if (!this.voz) this.elegir();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto.replace(/[🌟👍🤔⚠️😟👑🏰✨🎁⚖️🔄⚡🛡️🍴🎯🚀]/gu, ""));
    u.lang = this.voz ? this.voz.lang : "es-ES";
    if (this.voz) u.voice = this.voz;
    u.rate = 0.95;
    speechSynthesis.speak(u);
  },
  callar() {
    if (window.speechSynthesis) speechSynthesis.cancel();
  },
};
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => Voz.elegir();
