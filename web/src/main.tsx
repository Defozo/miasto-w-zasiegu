import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { isNativeApp } from "./native";
import "./display-settings.css";
import BrandMark from "./BrandMark";
import MotionPolicy from "./MotionPolicy";
import { applyDisplayPreferences } from "./display-preferences";
const AuthProvider = lazy(() => import("./auth/AuthProvider"));
const embedMatch = location.pathname.match(/^\/embed\/places\/([^/]+)\/?$/);
let embedPlaceId = "";
try {
  embedPlaceId = embedMatch ? decodeURIComponent(embedMatch[1]) : "";
} catch {
  /* Invalid IDs render an unavailable widget. */
}
if (!embedMatch) {
  applyDisplayPreferences();
  window.addEventListener("storage", () => applyDisplayPreferences());
}
const CityApp = lazy(() => import("./App"));
const Landing = lazy(() => import("./Landing"));
const Game = lazy(() => import("./Game"));
const EmbedPlace = lazy(() => import("./passports/EmbedPlace"));
const AuthPage = lazy(() => import("./auth/AuthPage"));
const Pricing = lazy(() => import("./Pricing"));
const needsAuth = /^\/(app|gra|cennik|pricing|sign-in|sign-up)(\/|$)/.test(
  location.pathname,
);
const content = embedMatch ? (
  <EmbedPlace placeId={embedPlaceId} />
) : /^\/sign-(in|up)(\/|$)/.test(location.pathname) ? (
  <AuthPage />
) : /^\/(cennik|pricing)(\/|$)/.test(location.pathname) ? (
  <Pricing />
) : location.pathname.startsWith("/gra") ? (
  <Game />
) : location.pathname.startsWith("/app") ? (
  <CityApp />
) : (
  <Landing />
);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionPolicy>
      <Suspense
        fallback={
          <div className="boot-screen">
            <BrandMark />
            <p>Otwieramy Miasto w zasięgu…</p>
          </div>
        }
      >
        {needsAuth ? <AuthProvider>{content}</AuthProvider> : content}
      </Suspense>
    </MotionPolicy>
  </StrictMode>,
);
if (!embedMatch && !isNativeApp() && import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
