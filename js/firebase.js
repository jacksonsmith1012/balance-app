import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported as messagingIsSupported,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyBrJR3qLmO_q9Ccu36ZGJUN-isIjenLz7A",
  authDomain: "balance-app-jacksonsmith.firebaseapp.com",
  projectId: "balance-app-jacksonsmith",
  storageBucket: "balance-app-jacksonsmith.firebasestorage.app",
  messagingSenderId: "711949661416",
  appId: "1:711949661416:web:e2b93a04a098dfc534c55d",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export {
  signInWithRedirect,
  getRedirectResult,
  fbSignOut,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
  serverTimestamp,
  getMessaging,
  getToken,
  onMessage,
  messagingIsSupported,
};
