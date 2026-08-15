import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCywt1SR9h_zD-T6sccuXTEOuNHWQEOU1o",
  authDomain: "tier--ladder.firebaseapp.com",
  projectId: "tier--ladder",
  storageBucket: "tier--ladder.firebasestorage.app",
  messagingSenderId: "451587986254",
  appId: "1:451587986254:web:e31aa2b758b3eb3f08841f",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
