import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import BrandName from "./BrandName";
import BrandMark from "./BrandMark";
import { m } from "motion/react";
import { useCalmMotion } from "./MotionPolicy";
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Compass,
  Flag,
  Footprints,
  HeartHandshake,
  Info,
  LocateFixed,
  MapPin,
  Navigation,
  Plus,
  Route as RouteIcon,
  Search,
  Settings2,
  ShieldQuestion,
  SlidersHorizontal,
  TreePine,
  Utensils,
  Landmark,
  TramFront,
  Accessibility,
  WifiOff,
  Bookmark,
  Download,
  ExternalLink,
  UserRound,
  Sparkles,
  Smartphone,
  Building2,
  BedDouble,
  Armchair,
  CircleParking,
  Toilet,
  Ellipsis,
} from "lucide-react";
const CityMap = lazy(() => import("./CityMap"));
const ForegroundGuidance = lazy(() => import("./ForegroundGuidance"));
const NativeGuidance = lazy(() => import("./NativeGuidance"));
import { isNativeApp, invalidateNativeRoute } from "./native";
const ObjectPanel = lazy(() => import("./passports/ObjectPanel"));
const PassportPlaceSection = lazy(
  () => import("./passports/PassportPlaceSection"),
);
import type { PlacePassport } from "../../shared/place-passports.mjs";
import RoutePanel from "./RoutePanel";
import AccountPanel from "./AccountPanel";
import LearningPanel from "./LearningPanel";
import GoodDiscoveries from "./GoodDiscoveries";
import PlaceFacts from "./PlaceFacts";
import PlaceEvidence, { placeSourceLabel } from "./PlaceEvidence";
import MapFilters, { DEFAULT_MAP_LAYERS, type MapLayers } from "./MapFilters";
import {
  DEFAULT_PLACE_FILTERS,
  hasPlaceFilters,
  matchesPlaceFilters,
  placeFiltersParams,
  type PlaceFilters,
} from "../../shared/place-filters.mjs";
import { useFavorites } from "./useFavorites";
import { alreadyOnJourney } from "./journey-stops";
import { profileHasChanges } from "./profile-draft";
import "./workflow.css";
import "./map-first.css";
import AddressInput from "./AddressInput";
import SavedPlaces from "./SavedPlaces";
import { useMobilityPresets } from "./useMobilityPresets";
import { useEquipmentResearch } from "./useEquipmentResearch";
import ProfileHub from "./ProfileHub";
import './pricing.css';
import SetupDialog from "./SetupDialog";
import MapTutorial, { useMapTutorial } from "./MapTutorial";
import { newPreset, neutralProfile } from "./PresetEditor";
import JourneyPanel from "./JourneyPanel";
import ProfilePanel, { defaultProfile } from "./ProfilePanel";
import ReportDialog, { reportLabels } from "./ReportDialog";
import ReportFeedback from "./ReportFeedback";
import PlaceResearch from "./PlaceResearch";
import "./accessibility.css";
import "./app-visual.css";
import type { AccessibilityFeature, RouteFact } from "./types";
import { api, dateLabel, metres, readLocal, writeLocal, logoutAccount } from "./api";
import type {
  AccountState,
  CommunityObservation,
  LocationPoint,
  MunicipalDataStatus,
  BarrierReport,
  Category,
  Coordinates,
  Place,
  MapPlace,
  Profile,
  Route,
  SavedRoute,
  Wheelchair,
  MobilityPreset, JourneyResult, JourneyAlternative,
} from "./types";

type Tab = "places" | "route" | "objects" | "community" | "profile" | "account" | "saved";
const START: Coordinates = [19.9415, 50.0647];
const categories: { id: Category; name: string; Icon: typeof Compass }[] = [
  { id: "all", name: "Wszystko", Icon: Compass },
  { id: "culture", name: "Kultura", Icon: Landmark },
  { id: "food", name: "Jedzenie", Icon: Utensils },
  { id: "toilet", name: "Toalety", Icon: Toilet },
  { id: "outdoors", name: "Na zewnątrz", Icon: TreePine },
  { id: "transport", name: "Transport", Icon: TramFront },
  { id: "accommodation", name: "Noclegi", Icon: BedDouble },
  { id: "services", name: "Usługi", Icon: Building2 },
];
const tabs: { id: Tab; name: string; Icon: typeof Compass }[] = [
  { id: "places", name: "Mapa", Icon: Compass },
  { id: "saved", name: "Zapisane", Icon: Bookmark },
  { id: "profile", name: "Profil", Icon: UserRound },
];
const accessLabels = {
  yes: "Według mapy: dostępne",
  limited: "Według mapy: częściowo",
  no: "Według mapy: niedostępne",
  unknown: "Dostępność do sprawdzenia",
};
function placePoint(place: Place): LocationPoint {
  return (
    place.location || {
      id: place.id,
      label: place.name,
      coordinates: place.coordinates,
      kind: "place",
      precision: "approximate",
      ...(place.sourceLabel ? { sourceLabel: place.sourceLabel } : {}),
      ...(place.sourceUrl ? { sourceUrl: place.sourceUrl } : {}),
      ...(place.coordinateKind ? { coordinateKind: place.coordinateKind } : {}),
    }
  );
}
export default function App() {
  const reducedMotion = useCalmMotion();
  const [tab, setTab] = useState<Tab>(
    new URLSearchParams(location.search).has("konto")
      ? "account"
      : new URLSearchParams(location.search).has("objects")
        ? "objects"
        : new URLSearchParams(location.search).has("obserwacje")
          ? "community"
          : "places",
  );
  const [initialObjectId] = useState(
    () => new URLSearchParams(location.search).get("objects") || undefined,
  );
  const [objectsOpened, setObjectsOpened] = useState(() =>
    new URLSearchParams(location.search).has("objects"),
  );
  const deepLinkHandled = useRef(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [mapPromotions, setMapPromotions] = useState<Place[]>([]);
  const [mapPlaces, setMapPlaces] = useState<MapPlace[] | null>(null);
  const [nextPlacesOffset, setNextPlacesOffset] = useState<number | null>(null);
  const [loadingMorePlaces, setLoadingMorePlaces] = useState(false);
  const [morePlacesError, setMorePlacesError] = useState("");
  const placesRequestVersion = useRef(0);
  const mapSelectionVersion = useRef(0);
  const mapPlaceRequest = useRef<{ id: string; controller: AbortController } | null>(null);
  const mapPlaceCache = useRef(new Map<string, { place: Place; fetchedAt: number }>());
  const [mapPlaceStatus, setMapPlaceStatus] = useState("");
  const [mapUnavailable, setMapUnavailable] = useState(false);
  function cancelMapSelection() {
    ++mapSelectionVersion.current;
    mapPlaceRequest.current?.controller.abort();
    mapPlaceRequest.current = null;
  }
  useEffect(() => {
    cancelMapSelection();
    setMapPlaceStatus("");
  }, [tab]);
  useEffect(() => () => mapPlaceRequest.current?.controller.abort(), []);
  const [municipalData, setMunicipalData] =
    useState<MunicipalDataStatus | null>(null);
  const [reports, setReports] = useState<BarrierReport[]>([]);
  const [reportLoad, setReportLoad] = useState<{
    owner: string | null | undefined;
    status: "loading" | "ready" | "error";
  }>({ owner: undefined, status: "loading" });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const displayReports = useMemo(
    () =>
      reports.map((report) => ({
        ...report,
        stale: report.duration === "temporary" ? now >= Date.parse(report.validUntil || report.createdAt) : report.stale,
      })),
    [reports, now],
  );
  const [observations, setObservations] = useState<CommunityObservation[]>([]);
  const currentObservations = useMemo(
    () =>
      observations.filter(
        (observation) => Date.parse(observation.validUntil) > now,
      ),
    [observations, now],
  );
  const [observationError, setObservationError] = useState("");
  const [observationsLoading, setObservationsLoading] = useState(false);
  const [observationReload, setObservationReload] = useState(0);
  const [focusedObservation, setFocusedObservation] = useState<string | null>(
    null,
  );
  const [wheelchairs, setWheelchairs] = useState<Wheelchair[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [mapArea, setMapArea] = useState<string>("");
  const [movedArea, setMovedArea] = useState<string>("");
  const [searchLocation, setSearchLocation] = useState<LocationPoint | null>(null);
  const [savedEditing, setSavedEditing] = useState<{point: LocationPoint | null} | null>(null);
  const [travelMode, setTravelMode] = useState<"direct" | "car">("direct");
  const [journey, setJourney] = useState<JourneyResult | null>(null);
  const [journeySelection, setJourneySelection] = useState<JourneyAlternative | null>(null);
  const [departed, setDeparted] = useState(false);
  const [livePosition, setLivePosition] = useState<Coordinates | null>(null);
  const [mapPosition, setMapPosition] = useState<Coordinates | null>(null);
  const [needsRampSpace, setNeedsRampSpace] = useState(false);
  const [category, setCategory] = useState<Category>("all");
  const [placeFilters, setPlaceFilters] = useState<PlaceFilters>({
    ...DEFAULT_PLACE_FILTERS,
  });
  const [mapLayers, setMapLayers] = useState<MapLayers>({
    ...DEFAULT_MAP_LAYERS,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount =
    Number(category !== "all") +
    Object.entries(placeFilters).filter(
      ([key, value]) =>
        value !== DEFAULT_PLACE_FILTERS[key as keyof PlaceFilters],
    ).length;
  const hiddenLayerCount = Object.values(mapLayers).filter(
    (value) => !value,
  ).length;
  const filterParams = placeFiltersParams(placeFilters);
  const placesQuery = `q=${encodeURIComponent(query)}${category === "all" ? "" : `&category=${category}`}${filterParams ? `&${filterParams}` : ""}${mapArea ? `&bbox=${mapArea}` : ""}`;
  function resetMapFilters() {
    setCategory("all");
    setPlaceFilters({ ...DEFAULT_PLACE_FILTERS });
    setMapLayers({ ...DEFAULT_MAP_LAYERS });
    setQuery("");
    setSearchLocation(null);
    setInspectedPlace(null);
  }
  function updatePlaceFilters(next: PlaceFilters) {
    setPlaceFilters(next);
    setMapLayers((current) => ({ ...current, places: true }));
    setInspectedPlace(null);
  }
  function updateCategory(next: Category) {
    setCategory(next);
    setMapLayers((current) => ({ ...current, places: true }));
    setInspectedPlace(null);
  }
  const [selected, setSelected] = useState<Place | null>(null);
  const [inspectedPlace, setInspectedPlace] = useState<Place | null>(null);
  const [profile, setProfile] = useState<Profile>(() =>
    readLocal("przejscie-profile", neutralProfile),
  );
  const [profileDraft, setProfileDraft] = useState<{
    ownerId: string | null;
    value: Profile;
  } | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [start, setStart] = useState<Coordinates>(START);
  const [startLabel, setStartLabel] = useState("");
  const [startPoint, setStartPoint] = useState<LocationPoint | null>(null);
  const [via, setVia] = useState<(LocationPoint | null)[]>([]);
  const [previewStop, setPreviewStop] = useState<LocationPoint | null>(null);
  const [onboarding, setOnboarding] = useState(() =>
    readLocal<string>("przejscie-onboarding", ""),
  );
  const [session, setSession] = useState<AccountState>({
    user: null,
    profile: null,
    profileVersion: 0,
  });
  const sessionLatest = useRef(session);
  const [verifiedOwner, setVerifiedOwner] = useState<string | null | undefined>(
    undefined,
  );
  const [checkingSession, setCheckingSession] = useState(true);
  const [editingPreset, setEditingPreset] = useState<{preset: MobilityPreset; onboarding: boolean} | null>(null);
  const [firstPreset] = useState(() => newPreset());
  const appliedPreset = useRef("");
  const presets = useMobilityPresets(session.user?.id ?? null, !checkingSession, session.profileVersion, (preset, version) => {
    const next = preset?.profile || neutralProfile;
    const signature = JSON.stringify([session.user?.id, preset?.id, next]);
    if (signature !== appliedPreset.current) {
      appliedPreset.current = signature; setProfile(next); invalidateRoute();
    }
    if (session.user && version !== session.profileVersion) setSession(s => ({ ...s, profile: preset?.profile || null, profileVersion: version }));
    if (preset) chooseOnboarding("configured");
  });
  const research = useEquipmentResearch(session.user?.id ?? null);
  const historyOwner = useRef(session.user?.id ?? null); historyOwner.current = session.user?.id ?? null;
  useEffect(() => {
    function restoreView(event: PopStateEvent) {
      const view = event.state?.przejscieView;
      if (!view || view.owner !== historyOwner.current) return;
      setPicking(false); reportPickView.current = null;
      setTab(view.tab); setInspectedPlace(view.place); setMobileView(view.mobileView);
      requestAnimationFrame(() => panel.current?.scrollTo({top: view.scroll || 0}));
    }
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, []);
  const restoredJourneyOwner = useRef<string | null>(null);
  useEffect(() => {
    if (!checkingSession && !presets.loading && !onboarding && !editingPreset && !presets.error)
      setEditingPreset({ preset: firstPreset, onboarding: true });
  }, [checkingSession, presets.loading, onboarding, presets.error]);
  useEffect(() => { setEditingPreset(null); }, [session.user?.id]);
  useEffect(() => {
    const owner = session.user?.id || "guest";
    if (checkingSession || presets.loading || restoredJourneyOwner.current === owner) return;
    restoredJourneyOwner.current = owner;
    const savedJourney = readLocal<{ result: JourneyResult; selection: string; place: Place; start: LocationPoint; via: (LocationPoint | null)[]; profile: Profile } | null>(`przejscie-car-journey-${session.user?.id || "guest"}`, null);
    if (savedJourney) {
      if (JSON.stringify(savedJourney.profile) === JSON.stringify(presets.active?.profile || neutralProfile)) {
        setJourney(savedJourney.result); setJourneySelection(savedJourney.result.alternatives.find(a => a.id === savedJourney.selection) || null);
      } else setRouteNotice("Zapisana podróż używała innego zestawu. Cel i przystanki zachowano. Oblicz trasę ponownie.");
      setSelected(savedJourney.place); setStartPoint(savedJourney.start); setStart(savedJourney.start.coordinates); setStartLabel(savedJourney.start.label);
      setVia(savedJourney.via); setTravelMode("car"); setDeparted(true);
    }
  }, [session.user?.id, checkingSession, presets.loading]);
  useEffect(() => {
    let active = true;
    async function refresh() {
      setObservationsLoading(true);
      try {
        const data = await api<{ observations: CommunityObservation[] }>(
          "/observations",
        );
        if (active) {
          setObservations(data.observations);
          setObservationError("");
        }
      } catch (e) {
        if (active) setObservationError((e as Error).message);
      } finally {
        if (active) setObservationsLoading(false);
      }
    }
    refresh();
    const interval = setInterval(refresh, 120000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [session.user?.id, observationReload]);
  const favoritePlaces = useFavorites(session.user?.id ?? null);
  sessionLatest.current = session;
  const authEpoch = useRef(0);
  const authReadVersion = useRef(0);
  const locationVersion = useRef(0);
  const [syncMessage, setSyncMessage] = useState(
    "Bez konta zapisujemy potrzeby tylko na tym urządzeniu.",
  );
  function chooseOnboarding(choice: string) {
    setOnboarding(choice);
    writeLocal("przejscie-onboarding", choice);
  }
  function applySession(s: AccountState) {
    authEpoch.current++;
    authReadVersion.current++;
    locationVersion.current++;
    setGpsBusy(false);
    setVerifiedOwner(s.user?.id ?? null);
    setCheckingSession(false);
    if ((sessionLatest.current.user?.id ?? null) !== (s.user?.id ?? null)) {
      setProfileDraft(null);
    }
    const switched = Boolean(
      sessionLatest.current.user &&
      sessionLatest.current.user.id !== s.user?.id,
    );
    if (switched) {
      invalidateRoute();
      clearPrivatePlan();
      setStartPoint(null);
      setStart(START);
      setStartLabel("");
      setReportPoint(START);
      setReportLocationChosen(false);
      setViewingSaved(false);
      setGpsBusy(false);
      locationVersion.current++;
      setSelected(null);
      setInspectedPlace(null);
      setVia([]);
      setReportOpen(false);
      setPicking(false);
      setProfile(defaultProfile);
      chooseOnboarding("");
      try {
        localStorage.removeItem("przejscie-profile");
      } catch {}
    }
    setSession({
      user: s.user,
      profile: s.profile,
      profileVersion: s.profileVersion,
    });
    if (s.profile) {
      setProfile(s.profile);
      chooseOnboarding("configured");
      invalidateRoute();
      setSyncMessage("Pobrano potrzeby z konta.");
    } else if (s.user)
      setSyncMessage("Zapisz obecne potrzeby, aby przenieść je na telefon.");
  }
  useEffect(() => {
    let mounted = true;
    async function refresh() {
      const version = authEpoch.current;
      const readVersion = ++authReadVersion.current;
      setCheckingSession(true);
      try {
        const s = await api<AccountState>("/auth/me");
        if (
          !mounted ||
          version !== authEpoch.current ||
          readVersion !== authReadVersion.current
        )
          return;
        const old = sessionLatest.current;
        setVerifiedOwner(s.user?.id ?? null);
        if (
          old.user?.id !== s.user?.id ||
          s.profileVersion > old.profileVersion
        )
          applySession(s);
      } catch {
        if (
          mounted &&
          version === authEpoch.current &&
          readVersion === authReadVersion.current
        )
          lockPrivatePlan();
      } finally {
        if (mounted && readVersion === authReadVersion.current)
          setCheckingSession(false);
      }
    }
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  async function saveProfile(p: Profile) {
    const epoch = authEpoch.current;
    const owner = session.user?.id ?? null;
    const commitProfile = () => {
      setProfile(p);
      setProfileDraft((current) =>
        current?.ownerId === owner && !profileHasChanges(current.value, p)
          ? null
          : current,
      );
      invalidateRoute();
      setViewingSaved(false);
      chooseOnboarding("configured");
    };
    if (!session.user) {
      if (!writeLocal("przejscie-profile", p))
        throw new Error(
          "Przeglądarka nie pozwoliła zapisać potrzeb. Zwolnij miejsce i spróbuj ponownie.",
        );
      commitProfile();
      setSyncMessage("Zapisano potrzeby na tym urządzeniu.");
      return;
    }
    try {
      const result = await api<{ profile: Profile; profileVersion: number }>(
        "/profile",
        {
          profile: p,
          expectedVersion: session.profileVersion,
          expectedUserId: session.user.id,
        },
        "PUT",
      );
      if (epoch !== authEpoch.current)
        throw new Error(
          "Konto zmieniło się podczas zapisu. Sprawdź bieżące potrzeby.",
        );
      setSession((s) => ({ ...s, ...result }));
      commitProfile();
      setSyncMessage(
        "Zapisano potrzeby na koncie. Możesz pobrać je na Androidzie.",
      );
    } catch (e) {
      if (epoch !== authEpoch.current) throw e;
      setSyncMessage(
        "Nie udało się zapisać nowych potrzeb. Trasy używają poprzednich ustawień. " +
          (e as Error).message,
      );
      throw e;
    }
  }
  async function logout() {
    authEpoch.current++;
    invalidateRoute();
    await logoutAccount(session.user?.id ?? null);
    applySession({ user: null, profile: null, profileVersion: 0 });
    setProfile(defaultProfile);
    clearPrivatePlan();
    setRoute(null);
    setSyncMessage("Wylogowano. Potrzeby konta usunięto z tego widoku.");
    try {
      localStorage.removeItem("przejscie-profile");
    } catch {}
    chooseOnboarding("");
  }
  function locationPlace(p: LocationPoint): Place {
    return {
      location: p,
      id: p.id,
      name: p.label,
      category: p.id.startsWith("ztp-stop-") ? "transport" : "outdoors",
      coordinates: p.coordinates,
      address: p.kind === "address" ? p.label : "",
      description: "Wybrana lokalizacja",
      access: {
        wheelchair: "unknown",
        widthCm: null,
        surface: null,
        toilet: "unknown",
        entranceNotes:
          p.precision === "approximate"
            ? "Punkt orientacyjny. Sprawdź dokładne wejście."
            : "",
      },
      sourceUrl: p.sourceUrl || "",
      coordinateKind: p.coordinateKind,
      verifiedAt: null,
      sourceLabel: p.sourceLabel || "",
    };
  }
  function updateStart(p: LocationPoint | null) {
    locationVersion.current++;
    setGpsBusy(false);
    setStartPoint(p);
    if (p) {
      setStart(p.coordinates);
      setStartLabel(p.label);
    }
    invalidateRoute();
    setViewingSaved(false);
  }
  function updateEnd(p: LocationPoint | null) {
    setSelected(p ? locationPlace(p) : null);
    invalidateRoute();
    setViewingSaved(false);
  }
  const [busy, setBusy] = useState(false);
  const [routeError, setRouteError] = useState<Error | null>(null);
  const [routeNotice, setRouteNotice] = useState("");
  const [avoidReports, setAvoidReports] = useState(true);
  const [toast, setToast] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportFormKey, setReportFormKey] = useState(0);
  const [reportFeature, setReportFeature] = useState<AccessibilityFeature | null>(null);
  const [editingReport, setEditingReport] = useState<BarrierReport | null>(null);
  const [evidenceFocus, setEvidenceFocus] = useState<RouteFact | null>(null);
  const [reportPoint, setReportPoint] = useState<Coordinates>(START);
  const [reportLocationChosen, setReportLocationChosen] = useState(false);
  const [picking, setPicking] = useState(false);
  const reportPickView = useRef<{ tab: Tab; mobileView: "list" | "map" } | null>(null);
  function returnToReport(point?: Coordinates) {
    if (point) {
      setReportLocationChosen(true);
      setReportPoint([Number(point[0].toFixed(6)), Number(point[1].toFixed(6))]);
    }
    const previous = reportPickView.current;
    reportPickView.current = null;
    setPicking(false);
    if (previous) {
      setTab(previous.tab);
      setMobileView(previous.mobileView);
    }
    setReportOpen(true);
  }
  const [storedPlan, setSaved] = useState<SavedRoute | null>(() =>
    readLocal("przejscie-saved-route", null),
  );
  const storedPlanRef = useRef(storedPlan);
  storedPlanRef.current = storedPlan;
  const saved =
    storedPlan &&
    ((storedPlan.scope === "device" && storedPlan.ownerId === null) ||
      (storedPlan.scope === "account" &&
        online &&
        !checkingSession &&
        typeof storedPlan.ownerId === "string" &&
        storedPlan.ownerId === verifiedOwner))
      ? storedPlan
      : null;
  function clearPrivatePlan() {
    if (storedPlanRef.current?.scope === "device") return;
    setSaved(null);
    try {
      localStorage.removeItem("przejscie-saved-route");
    } catch {}
  }
  const [viewingSaved, setViewingSaved] = useState(false);
  const [routeFormEpoch, setRouteFormEpoch] = useState(0);
  const viewingSavedRef = useRef(viewingSaved);
  viewingSavedRef.current = viewingSaved;
  function lockPrivatePlan() {
    setVerifiedOwner(undefined);
    if (!viewingSavedRef.current || storedPlanRef.current?.scope !== "account")
      return;
    setRouteFormEpoch((epoch) => epoch + 1);
    invalidateRoute();
    setStartPoint(null);
    setStart(START);
    setStartLabel("");
    setSelected(null);
    setVia([]);
    setReportPoint(START);
    setReportLocationChosen(false);
    setReportOpen(false);
  }
  useEffect(() => {
    function syncPlan(event: StorageEvent) {
      if (event.key !== "przejscie-saved-route" && event.key !== null) return;
      const next = readLocal<SavedRoute | null>("przejscie-saved-route", null);
      if (viewingSaved && next?.savedAt !== storedPlanRef.current?.savedAt) {
        setRouteFormEpoch((epoch) => epoch + 1);
        invalidateRoute();
        setViewingSaved(false);
        setStartPoint(null);
        setStart(START);
        setStartLabel("");
        setSelected(null);
        setVia([]);
      }
      setSaved(next);
    }
    window.addEventListener("storage", syncPlan);
    return () => window.removeEventListener("storage", syncPlan);
  }, [viewingSaved]);
  const [installHelp, setInstallHelp] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "map">(
    tab === "community" ? "list" : "map",
  );
  const panel = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const searchHeader = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const header = searchHeader.current;
    const container = workspace.current;
    if (!header || !container) return;
    const measure = () => container.style.setProperty(
      "--search-panel-height", `${header.getBoundingClientRect().height}px`,
    );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, [tab, inspectedPlace?.id]);
  const installEvent = useRef<(Event & { prompt: () => Promise<void> }) | null>(
    null,
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeVersion = useRef(0);
  const previousScreen = useRef(`${tab}:${inspectedPlace?.id || ""}`);
  useEffect(() => {
    const screen = `${tab}:${tab === "places" ? inspectedPlace?.id || "" : ""}`;
    if (previousScreen.current === screen) return;
    previousScreen.current = screen;
    if (tab === "community" && focusedObservation) return;
    const heading = Array.from(
      panel.current?.querySelectorAll("h1") ?? [],
    ).find((node) => node.getClientRects().length > 0);
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
    panel.current?.scrollTo({ top: 0 });
  }, [tab, inspectedPlace?.id, focusedObservation]);
  function invalidateRoute() {
    invalidateNativeRoute();
    routeVersion.current++;
    setViewingSaved(false);
    setRoute(null);
    setJourney(null);
    setJourneySelection(null);
    setBusy(false);
    setRouteError(null);
    setRouteNotice("");
    setPreviewStop(null);
  }
  useEffect(() => {
    if (!routeNotice || tab !== "route") return;
    const heading = Array.from(
      panel.current?.querySelectorAll("h1") ?? [],
    ).find((node) => node.getClientRects().length > 0);
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
    panel.current?.scrollTo({ top: 0 });
  }, [routeNotice, tab]);
  function addJourneyStop(point: LocationPoint) {
    if (via.length >= 5) {
      notify("Masz już 5 przystanków. Usuń jeden, aby dodać kolejne miejsce.");
      return;
    }
    const end = selected ? placePoint(selected) : null;
    if (alreadyOnJourney(point, [startPoint, ...via, end])) {
      notify("To miejsce jest już w Twoim planie.");
      return;
    }
    setVia([...via, point]);
    invalidateRoute();
    setRouteNotice(
      `Dodano przystanek ${via.length + 1}: ${point.label}. Sprawdź kolejność i wyznacz trasę ponownie.`,
    );
    changeTab("route");
  }
  function notify(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6000);
  }
  const [reloadToken, setReloadToken] = useState(0);
  const [totalPlaces, setTotalPlaces] = useState(0);
  const reportOwner = session.user?.id ?? null;
  const reportStatus = checkingSession || reportLoad.owner !== reportOwner
    ? "loading"
    : verifiedOwner !== reportOwner ? "error" : reportLoad.status;
  async function load() {
    setReloadToken((n) => n + 1);
    try {
      const data = await api<{ wheelchairs: Wheelchair[] }>("/wheelchairs");
      setWheelchairs(data.wheelchairs);
    } catch {}
  }
  useEffect(() => {
    if (checkingSession) return;
    if (reportOwner && verifiedOwner !== reportOwner) {
      setReportLoad({ owner: reportOwner, status: "error" });
      return;
    }
    let active = true;
    const epoch = authEpoch.current;
    setReportLoad({ owner: reportOwner, status: "loading" });
    api<{ reports: BarrierReport[] }>("/reports")
      .then((data) => {
        if (!active || epoch !== authEpoch.current) return;
        setReports(data.reports);
        setReportLoad({ owner: reportOwner, status: "ready" });
      })
      .catch(() => {
        if (active && epoch === authEpoch.current)
          setReportLoad({ owner: reportOwner, status: "error" });
      });
    return () => {
      active = false;
    };
  }, [reportOwner, checkingSession, verifiedOwner, reloadToken]);
  useEffect(() => {
    let canceled = false;
    ++placesRequestVersion.current;
    cancelMapSelection();
    mapPlaceCache.current.clear();
    setMapPlaceStatus("");
    setLoading(true);
    setNextPlacesOffset(null);
    setLoadingMorePlaces(false);
    setMorePlacesError("");
    setMapPlaces(null);
    setMapPromotions([]);
    setPlaces(items => items.map(({ promotion: _promotion, ...place }) => place));
    const timer = setTimeout(
      async () => {
        try {
          const result = await api<{
            places: Place[];
            mapPromotions?: Place[];
            mapPlaces?: MapPlace[];
            nextOffset?: number | null;
            total: number;
            municipalData?: MunicipalDataStatus;
          }>(
            `/places?limit=100&includeMap=true&${placesQuery}`,
          );
          if (canceled) return;
          setPlaces(result.places);
          setMapPromotions(result.mapPromotions ?? []);
          setMapPlaces(result.mapPlaces ?? null);
          setNextPlacesOffset(result.nextOffset ?? null);
          setMunicipalData(result.municipalData ?? null);
          setTotalPlaces(result.total);
          setLoadError("");
          if (!query && category === "all" && !filterParams && !result.places.some(p => p.promotion))
            writeLocal("przejscie-places", {
              places: result.places.map(({ promotion: _promotion, ...place }) => place),
              savedAt: new Date().toISOString(),
            });
        } catch (e) {
          if (canceled) return;
          setMunicipalData(null);
          const cached = readLocal<{ places: Place[]; savedAt: string } | null>(
            "przejscie-places",
            null,
          );
          if (cached) {
            setPlaces(cached.places.map(({ promotion: _promotion, ...place }) => place));
            setTotalPlaces(cached.places.length);
          } else {
            setPlaces([]);
            setTotalPlaces(0);
          }
          setLoadError(
            `${(e as Error).message}${cached ? ` Pokazujemy zapis miejsc z ${dateLabel(cached.savedAt)}.` : ""}`,
          );
        } finally {
          if (!canceled) setLoading(false);
        }
      },
      query ? 220 : 0,
    );
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [placesQuery, reloadToken, session.user?.id]);
  async function loadMorePlaces() {
    if (loading || loadingMorePlaces || nextPlacesOffset === null) return;
    const version = placesRequestVersion.current;
    setLoadingMorePlaces(true);
    setMorePlacesError("");
    try {
      const result = await api<{ places: Place[]; total: number; nextOffset: number | null }>(
        `/places?limit=100&offset=${nextPlacesOffset}&${placesQuery}`,
      );
      if (version !== placesRequestVersion.current) return;
      setPlaces(current => [...new Map([...current, ...result.places].map(place => [place.id, place])).values()]);
      setNextPlacesOffset(result.nextOffset);
      setTotalPlaces(result.total);
    } catch (error) {
      if (version === placesRequestVersion.current) setMorePlacesError((error as Error).message);
    } finally {
      if (version === placesRequestVersion.current) setLoadingMorePlaces(false);
    }
  }
  useEffect(() => {
    load();
    const on = () => setOnline(true),
      off = () => {
        setOnline(false);
        lockPrivatePlan();
      },
      install = (e: Event) => {
        e.preventDefault();
        installEvent.current = e as Event & { prompt: () => Promise<void> };
      };
    window.addEventListener("online", on);
    const refreshPaidVisibility = () => { setMapPlaces(null); setMapPromotions([]); setPlaces(items => items.map(({ promotion: _promotion, ...place }) => place)); setReloadToken(n => n + 1); };
    window.addEventListener("focus", refreshPaidVisibility);
    window.addEventListener("offline", off);
    window.addEventListener("beforeinstallprompt", install);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("focus", refreshPaidVisibility);
      window.removeEventListener("offline", off);
      window.removeEventListener("beforeinstallprompt", install);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  function rememberView(nextTab: Tab, place: Place | null) {
    if (tab === nextTab && inspectedPlace?.id === place?.id) return;
    const current = {owner: session.user?.id ?? null, tab, place: inspectedPlace, mobileView, scroll: panel.current?.scrollTop || 0};
    history.replaceState({...history.state, przejscieView: current}, "");
    history.pushState({przejscieView: {...current, tab: nextTab, place, scroll: 0}}, "");
  }
  function changeTab(t: Tab, observationId?: string) {
    setPicking(false);
    reportPickView.current = null;
    rememberView(t, t === "places" ? null : inspectedPlace);
    setPreviewStop(null);
    setFocusedObservation(observationId || null);
    setTab(t);
    if (t === "objects") setObjectsOpened(true);
    if (t === "places") {
      setReloadToken((value) => value + 1);
      setInspectedPlace(null);
    }
    setMobileView(t === "places" || t === "route" ? "map" : "list");
    if (!observationId) panel.current?.scrollTo({ top: 0 });
  }
  function selectPlace(p: Place) {
    cancelMapSelection();
    setMapPlaceStatus("");
    rememberView("places", p);
    setInspectedPlace(p);
    setTab("places");
    setMobileView("map");
    panel.current?.scrollTo({ top: 0 });
  }
  async function selectMapPlace(point: MapPlace) {
    const known = places.find(place => place.id === point.id);
    if (known) { selectPlace(known); return; }
    const cached = mapPlaceCache.current.get(point.id);
    if (cached && Date.now() - cached.fetchedAt < 60000) { selectPlace(cached.place); return; }
    if (mapPlaceRequest.current?.id === point.id) return;
    cancelMapSelection();
    const version = mapSelectionVersion.current;
    const controller = new AbortController();
    mapPlaceRequest.current = { id: point.id, controller };
    setMapPlaceStatus(`Wczytujemy szczegóły miejsca: ${point.name}…`);
    try {
      const place = await api<Place>(`/places/${encodeURIComponent(point.id)}`, undefined, undefined, controller.signal);
      if (version !== mapSelectionVersion.current || controller.signal.aborted) return;
      mapPlaceCache.current.delete(point.id);
      mapPlaceCache.current.set(point.id, { place, fetchedAt: Date.now() });
      if (mapPlaceCache.current.size > 50) mapPlaceCache.current.delete(mapPlaceCache.current.keys().next().value!);
      selectPlace(place);
    } catch (error) {
      if (version === mapSelectionVersion.current && !controller.signal.aborted) setMapPlaceStatus((error as Error).message);
    } finally {
      if (mapPlaceRequest.current?.controller === controller) mapPlaceRequest.current = null;
    }
  }
  async function planPassport(placeId: string, entranceId?: string) {
    invalidateRoute();
    const version = routeVersion.current;
    changeTab("route");
    try {
      const [place, passport] = await Promise.all([
        api<Place>(`/places/${encodeURIComponent(placeId)}`),
        entranceId
          ? api<PlacePassport>(
              `/place-passports/${encodeURIComponent(placeId)}`,
            )
          : Promise.resolve(null),
      ]);
      if (version !== routeVersion.current) return;
      if (entranceId) {
        const entrance = passport?.entrances.find(
          (item) => item.id === entranceId,
        );
        if (!entrance?.coordinates) {
          setSelected(null);
          setRouteError(new Error(
            entrance
              ? "To wejście nie ma podanego położenia. Wskaż cel samodzielnie na mapie lub wybierz adres."
              : "Wybranego wejścia nie ma już w paszporcie. Wybierz aktualny cel przejścia.",
          ));
          return;
        }
        const point: LocationPoint = {
          id: `${placeId}:entrance:${entrance.id}`,
          label: `${place.name} · ${entrance.label}`,
          coordinates: entrance.coordinates,
          kind: "place",
          precision: "approximate",
          sourceLabel: "Wejście opisane w paszporcie społeczności",
          coordinateKind: "source-point",
        };
        setSelected({
          ...place,
          name: point.label,
          coordinates: point.coordinates,
          location: point,
        });
        setRouteNotice(
          "Wybrano wejście z paszportu. Sprawdź punkt początkowy i swoje potrzeby, a następnie wyznacz trasę. Położenie wejścia jest informacją użytkownika.",
        );
      } else {
        setSelected(place);
        setRouteNotice(
          "Wybrano obiekt z paszportu. Sprawdź punkt początkowy i swoje potrzeby, a następnie wyznacz trasę. Punkt obiektu może różnić się od położenia wejścia.",
        );
      }
    } catch (error) {
      if (version !== routeVersion.current) return;
      setSelected(null);
      setRouteError(error as Error);
    }
  }
  useEffect(() => {
    if (checkingSession || presets.loading || deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    const params = new URLSearchParams(location.search);
    const placeId = params.get("place");
    if (placeId)
      void planPassport(placeId, params.get("entrance") || undefined);
  }, [checkingSession, presets.loading]);
  const normalized = (value: string) =>
    value
      .toLocaleLowerCase("pl")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replaceAll("ł", "l");
  const filtered = useMemo(() => [...places, ...mapPromotions.filter(p => !places.some(existing => existing.id === p.id))].filter(
    (p) =>
      (category === "all" || p.category === category) &&
      matchesPlaceFilters(p, placeFilters) &&
      (!loadError ||
        normalized(`${p.name} ${p.address || ""}`).includes(normalized(query))),
  ), [places, mapPromotions, category, placeFilters, loadError, query]);
  const resultPlaces = filtered;
  const mapPoints = mapPlaces ?? filtered;
  const mapSelectedPlace = useMemo(() => {
    const place = tab === "places" ? inspectedPlace : tab === "route" ? selected : null;
    return place ? { ...place, promotion: mapPoints.find(current => current.id === place.id)?.promotion } : null;
  }, [tab, inspectedPlace, selected, mapPoints]);
  const visibleObservations = useMemo(() => currentObservations.filter(
    (observation) =>
      observation.status === "active" &&
      !observation.stale &&
      mapLayers[observation.type],
  ), [currentObservations, mapLayers]);
  const mapReports = useMemo(() => mapLayers.reports ? displayReports : [], [mapLayers.reports, displayReports]);
  const resultTotal = loadError ? filtered.length : totalPlaces;
  const mapSummary = !mapLayers.places
    ? "Miejsca ukryte"
    : loading
      ? "Wczytujemy miejsca…"
      : `${category === "all" ? "Miejsca" : categories.find((item) => item.id === category)?.name}: ${mapPoints.length}${activeFilterCount > 0 ? " · filtry aktywne" : ""}${loadError ? " · zapis offline" : ""}`;
  async function planRoute() {
    if (busy || presets.loading || presets.error || !selected || !startPoint || via.some((p) => !p)) return;
    invalidateRoute();
    const version = routeVersion.current;
    setBusy(true);
    setRouteError(null);
    setViewingSaved(false);
    setTab("route");
    try {
      if (travelMode === "car") {
        const result = await api<JourneyResult>("/journeys", {
          mode: "car", start, end: selected.coordinates, waypoints: via.map(p => p!.coordinates), needsRampSpace,
          profile: { mobility: profile.mobility, ...(profile.widthCm ? {widthCm: Number(profile.widthCm)} : {}), maxIncline: Number(profile.maxIncline), maxKerbCm: Number(profile.maxKerbCm), avoidUnpaved: profile.avoidUnpaved },
          expectedUserId: session.user?.id ?? null, avoidReports,
        });
        if (routeVersion.current === version) { setJourney(result); setJourneySelection(result.alternatives[0]); setRoute(result.alternatives[0].onward); }
        return;
      }
      const result = await api<Route>("/route", {
        expectedUserId: session.user?.id ?? null,
        start,
        end: selected.coordinates,
        waypoints: via.map((p) => p!.coordinates),
        profile: {
          mobility: profile.mobility,
          ...(profile.widthCm ? { widthCm: Number(profile.widthCm) } : {}),
          maxIncline: Number(profile.maxIncline),
          maxKerbCm: Number(profile.maxKerbCm),
          avoidUnpaved: profile.avoidUnpaved,
        },
        avoidReports,
      });
      if (routeVersion.current === version) setRoute(result);
    } catch (e) {
      if (routeVersion.current === version) setRouteError(e as Error);
    } finally {
      if (routeVersion.current === version) setBusy(false);
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      notify(
        "Ta przeglądarka nie udostępnia lokalizacji. Wybierz punkt z listy.",
      );
      return;
    }
    setGpsBusy(true);
    const request = ++locationVersion.current;
    const account = authEpoch.current;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (
          request !== locationVersion.current ||
          account !== authEpoch.current
        )
          return;
        const p: Coordinates = [
          Number(pos.coords.longitude.toFixed(6)),
          Number(pos.coords.latitude.toFixed(6)),
        ];
        if (p[0] < 19.75 || p[0] > 20.25 || p[1] < 49.9 || p[1] > 50.2) {
          notify(
            "Twoja pozycja jest poza obszarem tej wersji. Wybierz początek w Krakowie.",
          );
        } else {
          setStart(p);
          setStartPoint({
            id: "gps",
            label: "Moja lokalizacja",
            coordinates: p,
            kind: "place",
            precision: "address",
          });
          setStartLabel("Moja lokalizacja");
          invalidateRoute();
          notify(
            `Ustawiono początek. Dokładność GPS: około ${Math.round(pos.coords.accuracy)} m.`,
          );
        }
        setGpsBusy(false);
      },
      () => {
        if (
          request !== locationVersion.current ||
          account !== authEpoch.current
        )
          return;
        notify(
          "Nie udało się odczytać lokalizacji. Możesz wybrać początek z listy.",
        );
        setGpsBusy(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }
  function locateMap() {
    if (!navigator.geolocation) { notify("Ta przeglądarka nie udostępnia lokalizacji."); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      setMapPosition([pos.coords.longitude, pos.coords.latitude]);
      notify(`Pokazano pozycję z dokładnością około ${Math.round(pos.coords.accuracy)} m.`);
    }, () => notify("Nie otrzymaliśmy pozycji. Nadal możesz wyszukać miejsce lub adres."), {enableHighAccuracy: true, timeout: 15000, maximumAge: 0});
  }
  function saveRoute(deviceAccess = false) {
    if (!route || !selected) return;
    const value: SavedRoute = {
      scope: !session.user || deviceAccess ? "device" : "account",
      ownerId: !session.user || deviceAccess ? null : session.user.id,
      route,
      place: selected,
      start,
      startLabel,
      profile: viewingSaved && storedPlan ? storedPlan.profile : profile,
      savedAt: new Date().toISOString(),
      waypoints: via.filter((x): x is LocationPoint => Boolean(x)),
    };
    if (writeLocal("przejscie-saved-route", value)) {
      setSaved(value);
      notify(
        value.scope === "device"
          ? "Zapisano plan dostępny bez logowania na tym urządzeniu. Instrukcje działają bez sieci, podkład mapy wymaga internetu."
          : "Zapisano plan dla Twojego konta na tym urządzeniu. Ponowne otwarcie wymaga sprawdzenia konta przez internet.",
      );
    } else
      notify(
        "Brak miejsca na zapis. Plan pozostaje dostępny do zamknięcia strony.",
      );
  }
  function restore() {
    if (!saved) return;
    setRouteFormEpoch((epoch) => epoch + 1);
    locationVersion.current++;
    setGpsBusy(false);
    invalidateRoute();
    setRoute(saved.route);
    setSelected(saved.place);
    setStart(saved.start);
    setStartPoint({
      id: "saved-start",
      label: saved.startLabel,
      coordinates: saved.start,
      kind: "place",
      precision: "address",
    });
    setVia(saved.waypoints || []);
    setStartLabel(saved.startLabel);
    setViewingSaved(true);
    setTab("route");
  }
  function deleteSavedPlan() {
    try {
      localStorage.removeItem("przejscie-saved-route");
      setSaved(null);
      if (viewingSaved) {
        invalidateRoute();
        setViewingSaved(false);
      }
      notify("Usunięto zapis planu z tego urządzenia.");
    } catch {
      notify("Nie udało się usunąć zapisu. Spróbuj ponownie.");
    }
  }
  async function resolveReport(r: BarrierReport) {
    try {
      const next = await api<BarrierReport>(`/reports/${r.id}/resolve`, {
        expectedUserId: session.user?.id ?? null,
      });
      setReports((current) => current.map((x) => (x.id === r.id ? next : x)));
      invalidateRoute();
      notify(
        "Zapisano informację o usunięciu. Wyznacz trasę ponownie, aby ją uwzględnić.",
      );
    } catch (e) {
      notify((e as Error).message);
    }
  }
  const categoryInfo = categories.find(
    (c) => c.id === inspectedPlace?.category,
  );
  const PlaceIcon = categoryInfo?.Icon || MapPin;
  const tutorialBlocked = checkingSession || !onboarding || presets.loading || Boolean(editingPreset) || filtersOpen || reportOpen || picking;
  const tutorial = useMapTutorial(
    !tutorialBlocked && !loading && tab === "places" && !inspectedPlace && !new URLSearchParams(location.search).has("place"),
  );
  return (
    <div
      className={`app-shell map-first mobile-${mobileView} ${tab === "places" || tab === "route" ? "map-screen" : "utility-screen"} ${inspectedPlace && tab === "places" ? "has-place" : ""} ${tab === "route" ? "planning-screen" : ""} ${tab === "objects" ? "objects-view" : ""} ${picking ? "report-picking" : ""}`}
    >
      <a href="#main-content" className="skip-link">
        Przejdź do treści
      </a>
      <aside className="nav-rail">
        <a className="app-brand" href="/" aria-label="Miasto w zasięgu, strona główna">
          <BrandMark />
          <span className="brand-word">
            <BrandName />
          </span>
        </a>
        <nav aria-label="Główna nawigacja">
          {tabs.map(({ id, name, Icon }) => (
            <m.button
              key={id}
              whileTap={reducedMotion ? undefined : { scale: 0.96 }}
              className={`nav-item ${tab === id || id === "places" && tab === "route" || id === "profile" && ["account", "objects", "community"].includes(tab) ? "active" : ""}`}
              aria-current={tab === id ? "page" : undefined}
              data-map-tour={id === "saved" ? "saved" : undefined}
              onClick={() => changeTab(id)}
            >
              <Icon size={23} />
              <span>{name}</span>
            </m.button>
          ))}
          <div className="nav-shortcuts">
            <a className="nav-item nav-shortcut" href="/#aplikacje">
              <Smartphone size={23} aria-hidden="true" />
              <span>Android / Wear OS</span>
            </a>
            <a className="nav-item nav-shortcut" href="/gra">
              <Sparkles size={23} aria-hidden="true" />
              <span>Iskry Miasta</span>
            </a>
          </div>
        </nav>
        <button
          className="nav-install"
          onClick={async () => {
            if (installEvent.current) {
              await installEvent.current.prompt();
              installEvent.current = null;
            } else setInstallHelp(!installHelp);
          }}
          aria-label="Jak zainstalować aplikację"
        >
          <Download size={23} />
          <span>Zainstaluj</span>
        </button>
      </aside>
      <main className="app-main" id="main-content">
        <div className="app-topbar">
          <a className="mobile-brand" href="/">
            <BrandMark />
            <BrandName />
          </a>
          <span className="app-location">
            <MapPin size={15} /> Kraków{" "}
            <span className="prototype-tag">wersja testowa</span>
          </span>
          <div className="topbar-actions" data-map-tour="needs">
            <label className="preset-switch"><span className="sr-only">Zestaw potrzeb</span><select value={presets.activePresetId || ""} onChange={e => { if (e.target.value) void presets.select(e.target.value).catch(e => notify(e.message)); else setEditingPreset({preset: newPreset(), onboarding: true}); }}>
              {!presets.activePresetId && <option value="">Ustaw potrzeby</option>}{presets.presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
            {tab !== "objects" && (
              <button
                type="button"
                className={`map-filter-trigger ${activeFilterCount || hiddenLayerCount ? "active" : ""}`}
                aria-label="Filtry mapy"
                aria-haspopup="dialog"
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal size={18} />
                <span>Filtry mapy</span>
                {activeFilterCount + hiddenLayerCount > 0 && (
                  <b aria-hidden="true">
                    {activeFilterCount + hiddenLayerCount}
                  </b>
                )}
              </button>
            )}
            {(tab === "places" || tab === "route") && (
              <button type="button" className="map-tour-trigger" data-map-tour="replay"
                aria-label="Przewodnik po mapie" aria-haspopup="dialog" onClick={tutorial.start}>
                <Compass size={19} aria-hidden="true" /><span>Przewodnik</span>
              </button>
            )}
            <button
              className="profile-pill"
              aria-label={
                profile.widthCm
                  ? `Szerokość ${profile.widthCm} cm. Twoje preferencje`
                  : "Twoje preferencje"
              }
              onClick={() => changeTab("profile")}
            >
              <Settings2 size={16} />
              <span>
                {profile.widthCm
                  ? `Szerokość ${profile.widthCm} cm`
                  : "Twoje preferencje"}
              </span>
            </button>
          </div>
        </div>
        {(!online || loadError) && (
          <div className="connection-banner" role="status">
            <WifiOff size={18} />
            <span>
              {!online
                ? "Jesteś offline. Nowe trasy i zgłoszenia wymagają połączenia."
                : loadError}
            </span>
            <button onClick={load}>Ponów</button>
          </div>
        )}
        {(tab === "places" || tab === "route") &&
        municipalData &&
        (municipalData.status !== "success" || municipalData.stale) ? (
          <div
            className="connection-banner municipal-data-banner"
            role="status"
          >
            <Info size={18} />
            <span>
              {!(
                municipalData.available ??
                places.some((place) => place.municipalFacts)
              ) && municipalData.status !== "success"
                ? "Dane przystanków z miasta są niedostępne. Nadal możesz korzystać z mapy społecznościowej i planować trasę, ale lista miejsc może być niepełna."
                : "Dane przystanków z miasta czekają na odświeżenie. Pokazujemy ostatni pobrany zapis; jego datę znajdziesz przy opisie miejsca."}
            </span>
            <button onClick={load}>Sprawdź ponownie</button>
          </div>
        ) : null}
        {installHelp && (
          <div className="install-banner" role="status">
            <span>
              W menu przeglądarki wybierz „Zainstaluj aplikację” lub „Dodaj do
              ekranu głównego”. Plan zapisany z dostępem bez logowania można
              otworzyć bez sieci. Podkład mapy wymaga internetu.
            </span>
            <button onClick={() => setInstallHelp(false)}>Rozumiem</button>
          </div>
        )}
        {mapPlaceStatus && (
          <div className="map-place-status" role="status" aria-atomic="true">
            <Info size={18} aria-hidden="true" />
            <span>{mapPlaceStatus}</span>
          </div>
        )}
        {mapUnavailable && (tab === "places" || tab === "route") && (
          <div className="map-place-status" role="status">
            <MapPin size={18} aria-hidden="true" />
            <span>Podkład mapy jest niedostępny. Nadal możesz korzystać z listy miejsc i instrukcji.</span>
          </div>
        )}
        <div className="workspace" ref={workspace}>
          <section
            className="content-panel"
            ref={panel}
            aria-label={
              {
                route: "Planowanie przejścia",
                places: "Odkrywaj miejsca",
                objects: "Obiekty",
                community: "Wspólnie",
                profile: "Twój profil",
                account: "Konto",
                saved: "Zapisane miejsca",
              }[tab]
            }
            aria-labelledby={
              tab === "objects" &&
              !checkingSession &&
              online &&
              (!session.user || verifiedOwner === session.user.id)
                ? "object-panel-heading"
                : undefined
            }
          >
            {tab === "objects" &&
              (checkingSession ||
                (session.user && verifiedOwner !== session.user.id) ||
                !online) && (
                <p className="panel-body" role="status">
                  {checkingSession
                    ? "Sprawdzamy bieżące konto…"
                    : "Połącz się z internetem, aby potwierdzić konto i otworzyć szkice."}
                </p>
              )}
            {objectsOpened && (
              <div
                hidden={
                  tab !== "objects" ||
                  checkingSession ||
                  Boolean(session.user && verifiedOwner !== session.user.id) ||
                  !online
                }
              >
                <Suspense fallback={<p role="status">Wczytujemy obiekty…</p>}>
                  <ObjectPanel
                    key={session.user?.id ?? "guest"}
                    session={session}
                    initialPlaceId={initialObjectId}
                    onRequireLogin={() => changeTab("account")}
                    onPlan={planPassport}
                  />
                </Suspense>
              </div>
            )}
            {tab === "places" && !inspectedPlace && (
              <>
                <header className="discover-header" ref={searchHeader} data-map-tour="search">
                  <span className="discover-kicker"><MapPin size={13} aria-hidden="true" /> KRAKÓW, PO SWOJEMU</span>
                  <h1>Dokąd dziś?</h1>
                  <p className="muted">
                    Znajdź miejsce. Sprawdź, czego się spodziewać.
                  </p>
                  <AddressInput label="Miejsce lub adres" value={searchLocation} query={query} onQuery={setQuery} favorites={favoritePlaces.favorites}
                    onChange={point => { setSearchLocation(point); if (point) {
                      const known = places.find(p => p.id === point.id);
                      if (known) selectPlace(known); else void api<Place>(`/places/${encodeURIComponent(point.id)}`).then(selectPlace).catch(() => selectPlace(locationPlace(point)));
                    } }} />
                  <div className="category-chips" aria-label="Kategorie miejsc">
                    {categories.filter(c => ["food", "toilet"].includes(c.id)).map(({ id, name, Icon }) => (
                      <button
                        key={id}
                        onClick={() => { updatePlaceFilters({ ...placeFilters, placeType: "all" }); updateCategory(id); }}
                        className={category === id ? "selected" : ""}
                        aria-pressed={category === id}
                      >
                        <Icon size={16} />
                        {name}
                      </button>
                    ))}
                    <button aria-pressed={placeFilters.placeType === "bench"} onClick={() => { setCategory("all"); updatePlaceFilters({ ...DEFAULT_PLACE_FILTERS, placeType: "bench" }); setQuery(""); setSearchLocation(null); }}><Armchair size={16} aria-hidden="true" />Odpoczynek</button>
                    <button aria-pressed={placeFilters.placeType === "parking"} onClick={() => { setCategory("all"); updatePlaceFilters({ ...DEFAULT_PLACE_FILTERS, placeType: "parking" }); setQuery(""); setSearchLocation(null); }}><CircleParking size={16} aria-hidden="true" />Parkingi</button>
                    <button onClick={() => setFiltersOpen(true)}><Ellipsis size={16} aria-hidden="true" />Więcej</button>
                  </div>
                  {hasPlaceFilters(placeFilters) && (
                    <div className="active-place-filters">
                      <span>Aktywne filtry: {activeFilterCount}</span>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setFiltersOpen(true)}
                      >
                        Zmień filtry
                      </button>
                    </div>
                  )}
                </header>
                {movedArea && movedArea !== mapArea && <button className="button secondary area-search" onClick={() => setMapArea(movedArea)}>Szukaj w tym obszarze</button>}
                {mapArea && <button className="text-button" onClick={() => setMapArea("")}>Pokaż listę z całego Krakowa</button>}
                {departed && <button className="button secondary full" onClick={() => changeTab("route")}>Kontynuuj podróż od parkingu</button>}
                {!departed && selected && <button className="button secondary full" onClick={() => changeTab("route")}>Wróć do planu podróży</button>}
                <div className="place-list">
                  <div className="list-heading">
                    <h2>
                      {query ? "Wyniki wyszukiwania" : "Kraków do odkrycia"}
                    </h2>
                    <span>{loading ? "…" : `${Math.min(resultPlaces.length, resultTotal)} z ${resultTotal} miejsc${mapArea ? " w obszarze" : ""}`}</span>
                  </div>
                  {loading ? (
                    <div role="status" className="loading-box">
                      <span className="loader" />
                      Wczytujemy miejsca…
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="empty-state">
                      <Search size={32} />
                      <h3>Nie znaleźliśmy takiego miejsca.</h3>
                      <p>
                        Spróbuj krótszej nazwy lub zmień filtry. Brak danych o
                        udogodnieniu nie oznacza, że go nie ma.
                      </p>
                      <button className="text-button" onClick={resetMapFilters}>
                        Pokaż wszystkie miejsca
                      </button>
                    </div>
                  ) : (
                    resultPlaces.map((p, index) => {
                      const Icon =
                        categories.find((c) => c.id === p.category)?.Icon ||
                        MapPin;
                      return (
                        <button
                          className="place-card"
                          data-map-tour={index === 0 ? "place" : undefined}
                          key={p.id}
                          onClick={() => selectPlace(p)}
                        >
                          <span className={`place-art ${p.category}`}>
                            <Icon size={27} />
                            <span className="art-circle" />
                          </span>
                          <span className="place-card-text">
                            <span className="place-name">{p.name}</span>
                            {p.promotion && <span className="promotion-label">Sponsorowane · {p.promotion.advertiser}</span>}
                            <span className="place-source-tag">
                              {p.passportRevision
                                ? "Paszport społeczności"
                                : p.municipalFacts
                                  ? `Dane miasta · przystanek ${p.municipalFacts.stopCode || ""}`
                                  : p.sourceLabel.includes("OpenStreetMap")
                                    ? "Mapa społecznościowa"
                                    : p.sourceLabel}
                            </span>
                            <span className="place-address">
                              {(p.address && !p.address.includes("OSM")
                                ? p.address
                                : "") ||
                                categories.find((c) => c.id === p.category)
                                  ?.name ||
                                "Kraków"}
                            </span>
                            <span
                              className={`access-label ${p.access.wheelchair}`}
                            >
                              <ShieldQuestion size={13} />
                              {p.passportRevision
                                ? "Warunki opisane w paszporcie"
                                : accessLabels[p.access.wheelchair] ||
                                  accessLabels.unknown}
                            </span>
                          </span>
                          <ChevronRight size={17} />
                        </button>
                      );
                    })
                  )}
                  <p className="list-footnote">
                    <Info size={15} /> Korzystamy z mapy społecznościowej i
                    danych miasta. Źródło oraz daty znajdziesz przy opisie
                    miejsca.
                  </p>
                  {morePlacesError && <p role="alert" className="muted">{morePlacesError}</p>}
                  {nextPlacesOffset !== null && (
                    <button className="button secondary full" disabled={loadingMorePlaces} onClick={() => void loadMorePlaces()}>
                      {loadingMorePlaces ? "Wczytujemy kolejne miejsca…" : "Pokaż kolejne miejsca"}
                    </button>
                  )}
                </div>
              </>
            )}
            {tab === "places" && inspectedPlace && (
              <div className="place-detail panel-body">
                <button
                  className="back-button"
                  onClick={() => {
                    cancelMapSelection();
                    setMapPlaceStatus("");
                    setInspectedPlace(null);
                  }}
                >
                  <ArrowLeft size={18} /> Wszystkie miejsca
                </button>
                <div className={`detail-art ${inspectedPlace.category}`}>
                  <PlaceIcon size={30} aria-hidden="true" />
                  <span className="detail-art-label">
                    {categoryInfo?.name} / KRAKÓW
                  </span>
                  <span className="detail-art-ring" />
                </div>
                <h1>{inspectedPlace.name}</h1>
                <p className="muted">
                  {inspectedPlace.address &&
                  !inspectedPlace.address.includes("OSM")
                    ? inspectedPlace.address
                    : "Kraków"}
                </p>
                <span
                  className={`access-label detail-status ${inspectedPlace.access.wheelchair}`}
                >
                  <ShieldQuestion size={15} />
                  {inspectedPlace.passportRevision
                    ? "Warunki opisane w paszporcie"
                    : accessLabels[inspectedPlace.access.wheelchair] ||
                      accessLabels.unknown}
                </span>
                <div className="essential-facts" aria-label="Najważniejsze warunki">
                  <span>Szerokość wejścia: <strong>{inspectedPlace.access.widthCm ? `${inspectedPlace.access.widthCm} cm` : "brak danych"}</strong></span>
                  <span>Próg: <strong>{inspectedPlace.access.thresholdCm != null ? `${inspectedPlace.access.thresholdCm} cm` : "brak danych"}</strong></span>
                  <span>Toaleta: <strong>{inspectedPlace.access.toilet === "yes" ? "według źródła dostępna" : inspectedPlace.access.toilet === "no" ? "według źródła niedostępna" : "do sprawdzenia"}</strong></span>
                  <span>{inspectedPlace.access.entranceNotes || "Warunki wejścia wymagają sprawdzenia."}</span>
                </div>
                <button
                  className="button primary full place-plan-action"
                  aria-describedby="place-route-note"
                  onClick={() => {
                    setSelected(inspectedPlace);
                    invalidateRoute();
                    setViewingSaved(false);
                    changeTab("route");
                  }}
                >
                  <RouteIcon size={19} /> Nawiguj{" "}
                  <ArrowRight size={18} />
                </button>
                <button className="button secondary full" onClick={() => void favoritePlaces.save(inspectedPlace.name, placePoint(inspectedPlace)).then(() => notify("Zapisano miejsce.")).catch(e => notify(e.message))}><Bookmark size={18} />Zapisz miejsce</button>
                <div className="notice">
                  <Info size={19} />
                  <p id="place-route-note">
                    Trasa prowadzi do punktu zaznaczonego na mapie. Położenie
                    dostępnego wejścia i warunki na miejscu mogą wymagać
                    sprawdzenia.
                  </p>
                </div>
                {!inspectedPlace.passportRevision && (
                  <PlaceFacts place={inspectedPlace} />
                )}
                <PlaceResearch key={inspectedPlace.id} place={inspectedPlace} />
                <Suspense
                  fallback={<p role="status">Wczytujemy paszport miejsca…</p>}
                >
                  <PassportPlaceSection
                    placeId={inspectedPlace.id}
                    onPlan={planPassport}
                  />
                </Suspense>
                {!inspectedPlace.passportRevision && (
                  <>
                    <PlaceEvidence
                      place={inspectedPlace}
                      municipalData={municipalData}
                    />
                    <div className="detail-facts">
                      <h2>Co wiemy o miejscu</h2>
                      <dl>
                        <div>
                          <dt>Szerokość przejścia</dt>
                          <dd>
                            {inspectedPlace.access.widthCm
                              ? `${inspectedPlace.access.widthCm} cm według mapy`
                              : "Brak pomiaru"}
                          </dd>
                        </div>
                        <div>
                          <dt>
                            {inspectedPlace.municipalFacts
                              ? "Nawierzchnia dojścia"
                              : "Nawierzchnia"}
                          </dt>
                          <dd>
                            {(
                              {
                                asphalt: "Asfalt",
                                paving_stones: "Kostka brukowa",
                                sett: "Bruk kamienny",
                                concrete: "Beton",
                                ground: "Ziemia",
                                gravel: "Żwir",
                                fine_gravel: "Drobny żwir",
                                unpaved: "Nieutwardzona",
                                paved: "Utwardzona",
                                compacted: "Utwardzone kruszywo",
                                sand: "Piasek",
                                grass: "Trawa",
                              } as Record<string, string>
                            )[inspectedPlace.access.surface || ""] ||
                              "Brak szczegółowej informacji"}
                          </dd>
                        </div>
                        <div>
                          <dt>Dostępna toaleta</dt>
                          <dd>
                            {inspectedPlace.access.toilet === "yes"
                              ? "Według mapy: tak"
                              : inspectedPlace.access.toilet === "limited"
                                ? "Według mapy: częściowo dostępna"
                                : inspectedPlace.access.toilet === "no"
                                  ? "Według mapy: nie"
                                  : "Do sprawdzenia"}
                          </dd>
                        </div>
                        <div>
                          <dt>Sprawdzenie w terenie</dt>
                          <dd>
                            {inspectedPlace.verifiedAt
                              ? dateLabel(inspectedPlace.verifiedAt)
                              : "Niepotwierdzone"}
                          </dd>
                        </div>
                      </dl>
                      {inspectedPlace.access.entranceNotes && (
                        <p className="muted">
                          {inspectedPlace.access.entranceNotes
                            .replace(
                              "Punkt reprezentatywny obszaru OSM, nie wejście. Sprawdź rzeczywisty dojazd i wejście.",
                              "Punkt orientacyjny obszaru lub budynku. Nie wskazuje sprawdzonego wejścia.",
                            )
                            .replaceAll("OSM", "OpenStreetMap")}
                        </p>
                      )}
                    </div>
                  </>
                )}
                <button
                  className="button secondary full"
                  onClick={() => {
                    setReportPoint(inspectedPlace.coordinates);
                    setReportLocationChosen(true);
                    setReportOpen(true);
                  }}
                >
                  <Plus size={18} /> Dodaj obserwację
                </button>
                <div className="source-links">
                  {inspectedPlace.sourceUrl && (
                    <a
                      href={inspectedPlace.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Źródło: {placeSourceLabel(inspectedPlace)}{" "}
                      <ExternalLink size={13} />
                    </a>
                  )}
                  <a
                    href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${inspectedPlace.coordinates[1]},${inspectedPlace.coordinates[0]}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Obejrzyj zdjęcia ulicy <ExternalLink size={13} />
                  </a>
                </div>
                <p className="privacy-note">
                  Podgląd otworzy serwis Google. Zdjęcia mogą być starsze lub
                  niedostępne.
                </p>
              </div>
            )}
            {tab === "profile" && (
              <>
                <ProfileHub presets={presets} onEdit={preset => setEditingPreset({preset, onboarding: !presets.presets.some(p => p.id === preset.id)})} onSection={changeTab} />
                <div className="panel-body">
                  <LearningPanel
                    key={session.user?.id || "guest"}
                    userId={session.user?.id ?? null}
                    onAccount={() => changeTab("account")}
                  />
                  <button
                    className="button secondary full"
                    onClick={() => changeTab("route")}
                  >
                    Wróć do planowania
                  </button>
                </div>
              </>
            )}
            {tab === "saved" && <div className="panel-body saved-hub"><h1>Zapisane</h1><p className="muted">Miejsca, do których chcesz wrócić.</p>
              <SavedPlaces expanded data={favoritePlaces} userId={session.user?.id ?? null} editing={savedEditing} onEdit={setSavedEditing}
                onStart={p => { updateStart(p); changeTab("route"); }} onEnd={p => { updateEnd(p); changeTab("route"); }} />
              {saved && <button className="button secondary full" onClick={restore}>Otwórz zapisany plan</button>}
            </div>}
            {tab === "account" && (
              <AccountPanel
                session={session}
                onSession={applySession}
                onLogout={logout}
                onUpload={() => saveProfile(profile)}
                syncMessage={syncMessage}
              />
            )}
            {tab === "route" && (
              <RoutePanel
                onFocusEvidence={(fact) => { setEvidenceFocus(fact); setMobileView("map"); }}
                guidanceControls={route && travelMode === "direct" ? <Suspense fallback={null}>{isNativeApp() ? <NativeGuidance route={route} profile={profile} saved={viewingSaved} /> : <ForegroundGuidance key={JSON.stringify([route.geometry, profile])} route={route} onPosition={setLivePosition} />}</Suspense> : null}
                modeControls={<JourneyPanel mode={travelMode} onMode={mode => { invalidateRoute(); setTravelMode(mode); }} result={journey}
                  selectedId={journeySelection?.id || null} onSelect={a => { setJourneySelection(a); setRoute(a.onward); }}
                  departed={departed} ramp={needsRampSpace} onRamp={v => { setNeedsRampSpace(v); invalidateRoute(); }}
                  onDepart={a => {
                    if (selected && startPoint && journey) {
                      const stored = writeLocal(`przejscie-car-journey-${session.user?.id || "guest"}`, {result: journey, selection: a.id, place: selected, start: startPoint, via, profile});
                      if (!stored) { notify("Nie udało się zapisać podróży na urządzeniu. Zwolnij miejsce i spróbuj ponownie."); return false; }
                      setDeparted(true);
                      return true;
                    }
                    return false;
                  }} onContinue={a => {
                    updateStart({id: `${a.id}-exit`, label: `Przy parkingu: ${a.parking.name}`, coordinates: a.transfer.mobilityExit, kind: "place", precision: "approximate"});
                      setTravelMode("direct"); setDeparted(false);
                      localStorage.removeItem(`przejscie-car-journey-${session.user?.id || "guest"}`);
                    setRouteNotice("Potwierdź punkt startu przy parkingu lub użyj aktualnej lokalizacji, a następnie wyznacz dalszą trasę.");
                  }} />}
                key={`${session.user?.id || "guest"}:${routeFormEpoch}`}
                favorites={favoritePlaces}
                userId={session.user?.id ?? null}
                start={startPoint}
                end={selected ? placePoint(selected) : null}
                via={via}
                onAddStop={addJourneyStop}
                onPreviewStop={(point) => {
                  setPreviewStop(point);
                  setMobileView("map");
                }}
                routeNotice={routeNotice}
                profilePending={presets.loading || Boolean(presets.error) || Boolean(
                  profileDraft &&
                  profileDraft.ownerId === (session.user?.id ?? null) &&
                  profileHasChanges(profileDraft.value, profile),
                )}
                setStart={updateStart}
                setEnd={updateEnd}
                setVia={(points) => {
                  setVia(points);
                  invalidateRoute();
                  setViewingSaved(false);
                }}
                route={route}
                profile={
                  viewingSaved && storedPlan ? storedPlan.profile : profile
                }
                busy={busy}
                online={online}
                error={routeError}
                avoidReports={avoidReports}
                setAvoidReports={(v) => {
                  setAvoidReports(v);
                  invalidateRoute();
                }}
                onPlan={planRoute}
                onLocate={locate}
                gpsBusy={gpsBusy}
                onProfile={() => changeTab("profile")}
                onSave={saveRoute}
                onRestore={restore}
                onDeleteSaved={deleteSavedPlan}
                saved={saved}
                hiddenPlan={
                  storedPlan && !saved
                    ? storedPlan.scope === "account"
                      ? "account"
                      : "legacy"
                    : null
                }
                onAccount={() => changeTab("account")}
                viewingSaved={viewingSaved}
                onMap={() => setMobileView("map")}
                onReport={() => {
                  setReportPoint(start);
                  setReportLocationChosen(false);
                  setReportOpen(true);
                }}
                onboarding="configured"
                onOnboarding={chooseOnboarding}
              />
            )}
            {tab === "community" && (
              <div className="community-panel panel-body">
                <p className="eyebrow">OBSERWACJE UŻYTKOWNIKÓW</p>
                <a href="/gra" className="game-invite">
                  <Sparkles size={24} />
                  <span>
                    <strong>Zagraj w Iskry Miasta</strong>
                    <small>
                      Zbieraj punkty za obserwacje i odblokowuj ozdoby do ogrodu.
                    </small>
                  </span>
                  <ArrowRight size={20} />
                </a>
                <h1>Dodaj obserwację</h1>
                <p className="muted">
                  Otwórz formularz „Dodaj obserwację”, wskaż miejsce na mapie
                  lub z listy i opisz zauważone warunki.
                </p>
                <div className="contribution-card">
                  <HeartHandshake size={31} aria-hidden="true" />
                  <div>
                    <div role="status">
                      {checkingSession ? (
                        <span>Sprawdzamy Twoje konto…</span>
                      ) : verifiedOwner === undefined ? (
                        <span>Nie udało się potwierdzić konta. Odśwież stronę, aby spróbować ponownie.</span>
                      ) : session.user ? (
                        <>
                          {reportStatus === "ready" && (
                            <strong>{reports.filter((report) => report.isMine).length}</strong>
                          )}
                          <span>Twoje obserwacje zapisane na koncie</span>
                          <small>{reportStatus === "loading"
                            ? "Pobieramy obserwacje…"
                            : reportStatus === "error"
                              ? "Nie udało się pobrać liczby obserwacji."
                              : "Dostępne po zalogowaniu także na innym urządzeniu."}</small>
                        </>
                      ) : (
                        <>
                          <span>Zapisuj obserwacje na swoim koncie</span>
                          <small>Obserwacje dodane bez logowania są publiczne, ale nie są przypisane do konta.</small>
                        </>
                      )}
                    </div>
                    {!checkingSession && verifiedOwner !== undefined && (session.user
                      ? reportStatus === "error" && <button className="text-button" onClick={() => setReloadToken(n => n + 1)}>Spróbuj ponownie</button>
                      : <button className="text-button" onClick={() => changeTab("account")}>Zaloguj się</button>)}
                  </div>
                  <span className="contribution-decoration" aria-hidden="true">
                    ↗
                  </span>
                </div>
                <button
                  className="button primary full"
                  onClick={() => {
                    setReportPoint(selected?.coordinates || start);
                    setReportLocationChosen(Boolean(selected));
                    setReportOpen(true);
                  }}
                >
                  <Plus size={19} /> Dodaj obserwację
                </button>
                <p className="privacy-note">
                  Obserwacje są publiczne. Nie podawaj danych osobowych.
                </p>
                <div className="community-stats">
                  <span>
                    <strong>
                      {reports.filter((r) => r.status === "active").length}
                    </strong>{" "}
                    aktywnych obserwacji
                  </span>
                  <span>
                    <strong>
                      {reports.filter((r) => r.status === "resolved").length}
                    </strong>{" "}
                    oznaczonych jako usunięte
                  </span>
                </div>
                <h2>Ostatnie obserwacje</h2>
                {reports.length === 0 ? (
                  <div className="empty-state compact">
                    <MapPin size={30} />
                    <h3>Pierwsza obserwacja przed nami.</h3>
                    <p>
                      Dodaj znaną Ci przeszkodę z dokładną lokalizacją i opisem.
                    </p>
                  </div>
                ) : (
                  displayReports.slice(0, 25).map((r) => (
                    <article className="report-card" key={r.id} id={`report-${r.id}`}>
                      <div className="report-card-head">
                        <span className={`report-status ${r.status}`}>
                          {r.status === "resolved"
                            ? "Oznaczona jako usunięta"
                            : r.stale
                              ? "Starsza obserwacja"
                              : "Do potwierdzenia"}
                        </span>
                        <time dateTime={r.createdAt}>
                          {dateLabel(r.createdAt)}
                        </time>
                      </div>
                      <h3>{reportLabels[r.kind]}</h3>
                      <p>{r.description}</p>
                      {r.widthCm && <p>Podany pomiar: {r.widthCm} cm</p>}
                      <small>
                        {r.coordinates[1].toFixed(5)},{" "}
                        {r.coordinates[0].toFixed(5)}
                      </small>
                      <ReportFeedback report={r} userId={session.user?.id ?? null}
                        onUpdate={next => { setReports(current => current.map(r => r.id === next.id ? next : r)); invalidateRoute(); }}
                        onEdit={() => { setReportFeature(null); setEditingReport(r); setReportPoint(r.coordinates); setReportLocationChosen(true); setReportOpen(true); }} />
                      {r.status === "active" && r.canResolve && (
                        <button
                          className="text-button"
                          onClick={() => resolveReport(r)}
                        >
                          <Check size={16} /> Potwierdzam, że problem usunięto
                        </button>
                      )}
                    </article>
                  ))
                )}
                <div className="notice">
                  <Info size={19} />
                  <p>
                    Oceniaj fakty, nie cudze możliwości. Nie musisz pokonywać
                    przeszkody, aby ją zgłosić.
                  </p>
                </div>
                <GoodDiscoveries
                  key={session.user?.id || "guest"}
                  observations={currentObservations}
                  loading={observationsLoading}
                  error={observationError}
                  userId={session.user?.id ?? null}
                  focusedId={focusedObservation}
                  stopCount={via.length}
                  onAddStop={(o) => {
                    if (Date.parse(o.validUntil) <= Date.now()) {
                      notify(
                        "Ta obserwacja wymaga ponownego sprawdzenia. Odśwież odkrycia.",
                      );
                      return;
                    }
                    addJourneyStop({
                      id: `observation-${o.id}`,
                      label: o.label,
                      coordinates: o.coordinates,
                      kind: "place",
                      precision: "approximate",
                      sourceLabel: "Obserwacja mieszkańca",
                    });
                  }}
                  onReload={() => setObservationReload((v) => v + 1)}
                  onMap={(id) => {
                    const observation = currentObservations.find(
                      (item) => item.id === id,
                    );
                    if (observation)
                      setMapLayers((current) => ({
                        ...current,
                        [observation.type]: true,
                      }));
                    setFocusedObservation(id);
                    setMobileView("map");
                  }}
                  onRoute={(o) => {
                    updateEnd({
                      id: `observation-${o.id}`,
                      label: o.label,
                      coordinates: o.coordinates,
                      kind: "place",
                      precision: "approximate",
                      sourceLabel: "Obserwacja mieszkańca",
                    });
                    changeTab("route");
                  }}
                />
              </div>
            )}
          </section>
          {true && (
            <>
              <Suspense
                fallback={
                  <section className="map-section">
                    <div className="loading-box" role="status">
                      Wczytujemy mapę…
                    </div>
                  </section>
                }
              >
                <CityMap
                  onUnavailableChange={setMapUnavailable}
                  evidenceFocus={evidenceFocus}
                  onReportFeature={(feature) => {
                    setEditingReport(null); setReportFeature(feature);
                    const g = feature.geometry;
                    setReportPoint(g.type === "Point" ? g.coordinates : g.type === "Polygon" ? g.coordinates[0][0] : g.coordinates[0]);
                    setReportLocationChosen(true); setReportOpen(true);
                  }}
                  onReportSelect={() => changeTab("community")}
                  livePosition={livePosition || mapPosition}
                  mapPosition={mapPosition}
                  onLocate={locateMap}
                  driveRoute={travelMode === "car" ? journeySelection?.drive || null : null}
                  onAreaChange={setMovedArea}
                  places={mapPoints}
                  showPlaces={mapLayers.places}
                  filterSummary={mapSummary}
                  onOpenFilters={() => setFiltersOpen(true)}
                  selected={mapSelectedPlace}
                  onSelect={selectMapPlace}
                  route={route}
                  start={startPoint?.coordinates || null}
                  waypoints={via}
                  previewStop={previewStop}
                  onDismissPreview={() => setPreviewStop(null)}
                  journeyMode={tab === "route"}
                  reports={mapReports}
                  observations={visibleObservations}
                  focusedObservation={focusedObservation}
                  onObservation={(id) => {
                    changeTab("community", id);
                  }}
                  picking={picking}
                  onCancelPick={() => returnToReport()}
                  onPick={returnToReport}
                />
              </Suspense>
              <button
                className="mobile-map-toggle"
                onClick={() =>
                  setMobileView(mobileView === "list" ? "map" : "list")
                }
              >
                {mobileView === "list" ? (
                  <MapPin size={18} />
                ) : (
                  <Compass size={18} />
                )}{" "}
                {mobileView === "list" ? "Pokaż mapę" : "Pokaż listę"}
              </button>
            </>
          )}
        </div>
      </main>
      {research.job && research.job.status !== "searching" && research.presetId && !editingPreset && <button className="research-ready" onClick={() => {
        const preset = presets.presets.find(p => p.id === research.presetId) || readLocal<MobilityPreset | null>(`przejscie-preset-draft-${session.user?.id || "guest"}-${research.presetId}`, null);
        if (preset) setEditingPreset({preset, onboarding: false});
      }}>{research.job.status === "needs_reply" || research.job.status === "needs_choice" ? "Asystent sprzętu ma pytanie" : research.job.status === "failed" ? "Wróć do rozmowy o sprzęcie" : "Wynik analizy sprzętu jest gotowy"}</button>}
      {editingPreset && <SetupDialog key={`${session.user?.id || "guest"}:${editingPreset.preset.id}`} initial={editingPreset.preset} onboarding={editingPreset.onboarding}
        usesCar={presets.usesCar} ownerId={session.user?.id ?? null} models={wheelchairs} research={research}
        onSave={async (preset, car) => { await presets.save(preset, car); chooseOnboarding("configured"); notify(preset.kind !== "walking" && !preset.profile.widthCm ? "Zapisano zestaw potrzeb. Szerokość sprzętu nie jest podana; możesz ją uzupełnić w profilu." : "Zapisano zestaw potrzeb."); changeTab("places"); }}
        onClose={() => { if (!onboarding) chooseOnboarding("skipped"); setEditingPreset(null); }} />}
      {tutorial.open && !tutorialBlocked && (tab === "places" || tab === "route") && <MapTutorial onFinish={tutorial.finish} />}
      <MapFilters
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        category={category}
        onCategory={updateCategory}
        filters={placeFilters}
        onFilters={updatePlaceFilters}
        layers={mapLayers}
        onLayers={setMapLayers}
        onReset={resetMapFilters}
        onPreset={(nextCategory, nextFilters) => {
          updateCategory(nextCategory);
          updatePlaceFilters(nextFilters);
          setQuery("");
        }}
        total={resultTotal}
        loading={loading}
        loadError={Boolean(loadError)}
      />
      <ReportDialog
        key={`${session.user?.id || "guest"}:${editingReport?.id || reportFeature?.id || "new"}:${reportFormKey}`}
        initialFeature={reportFeature}
        initialReport={editingReport}
        userId={session.user?.id ?? null}
        open={reportOpen}
        onClose={() => { setReportOpen(false); setReportFeature(null); setEditingReport(null); setReportFormKey(v => v + 1); }}
        coordinates={reportPoint}
        locationChosen={reportLocationChosen}
        onCoordinates={(point) => {
          setReportPoint(point);
          setReportLocationChosen(true);
        }}
        places={places}
        onPick={() => {
          reportPickView.current = { tab, mobileView };
          setReportOpen(false);
          setPicking(true);
          setTab("places");
          setMobileView("map");
        }}
        onSaved={(r) => {
          setReports((current) => [r, ...current.filter((x) => x.id !== r.id)]);
          setReloadToken((n) => n + 1);
          invalidateRoute();
        }}
      />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
