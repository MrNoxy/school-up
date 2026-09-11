// Public Firebase web configuration, shared with Skip. Never put server keys here.
export const SKIP_CONFIG = {
  firebase: {
    apiKey: "AIzaSyDkorKjbFJica8XAWMApXplIM_NFvCdPa4",
    authDomain: "skip-4bf6f.firebaseapp.com",
    databaseURL:
      "https://skip-4bf6f-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "skip-4bf6f",
    storageBucket: "skip-4bf6f.firebasestorage.app",
    messagingSenderId: "720098009724",
    appId: "1:720098009724:web:7d4eeed33ac67fe6385ff9",
  },
  functionsRegion: "europe-west1",
  // Add the PUBLIC reCAPTCHA v3 site key registered in Firebase App Check.
  // Quick sign-in stays unavailable until configured; email/password still works.
  appCheckSiteKey: "",
  skipUrl: "", // Optional: your existing Skip website URL, for the "Open Skip" link.
};
