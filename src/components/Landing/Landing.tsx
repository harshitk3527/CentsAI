"use client";

import { useSyncExternalStore } from "react";
import { auth, isTokenExpired } from "@/lib/api";
import { Hero } from "./Hero";
import { Navbar } from "./Navbar";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function getUsername() {
  const token = localStorage.getItem("token");
  return token && !isTokenExpired(token) ? auth.getUsername() : null;
}

export function Landing() {
  const username = useSyncExternalStore(subscribe, getUsername, () => null);

  return (
    <>
      <Navbar username={username} />
      <Hero signedIn={username !== null} />
    </>
  );
}
