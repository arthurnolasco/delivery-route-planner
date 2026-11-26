/*
 * Copy this file to js/config.js and fill it in to enable Firebase mode
 * (shared password + live sync). js/config.js is git-ignored.
 * Without js/config.js the app runs in demo mode with fictional data.
 *
 * The Firebase web config is not a secret: access is enforced by
 * firestore.rules, which only lets the account below read or write.
 */
window.APP_CONFIG = {
  title: "Entrega dos Empadões",          // header title
  eyebrow: "Ação beneficente",            // small text above the title
  logo: "",                               // optional image URL or data URI
  logoAlt: "",
  city: "Guarapari - ES",                 // appended to address searches on Google Maps
  document: "app/plan",                   // Firestore document that stores the plan
  loginEmail: "deliveries@example.com",   // the single Firebase Auth user; people only type its password
  firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.firebasestorage.app",
    messagingSenderId: "000000000000",
    appId: "YOUR_APP_ID"
  }
};
