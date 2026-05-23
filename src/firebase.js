import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
const firebaseConfig = {
  apiKey: "AIzaSyAuw-2OL4bSjxABfwcgA_ZOp-b2vgtQnkE",
  authDomain: "fusion-cuentas.firebaseapp.com",
  projectId: "fusion-cuentas",
  storageBucket: "fusion-cuentas.firebasestorage.app",
  messagingSenderId: "159404790541",
  appId: "1:159404790541:web:2d9d69be52994d9cead644",
  measurementId: "G-9NXRZCLQEE"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);