import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppLayout } from "./components/Layout";
import { ErrorState, Skeleton } from "./components/ui";

const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const MediaPage = lazy(() => import("./pages/MediaPage").then((module) => ({ default: module.MediaPage })));
const DevelopmentPage = lazy(() => import("./pages/DevelopmentPage").then((module) => ({ default: module.DevelopmentPage })));
const LearningPage = lazy(() => import("./pages/LearningPage").then((module) => ({ default: module.LearningPage })));
const FitnessPage = lazy(() => import("./pages/FitnessPage").then((module) => ({ default: module.FitnessPage })));
const DietPage = lazy(() => import("./pages/DietPage").then((module) => ({ default: module.DietPage })));
const EntertainmentPage = lazy(() => import("./pages/EntertainmentPage").then((module) => ({ default: module.EntertainmentPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Skeleton lines={8} />}>{children}</Suspense>;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <div className="route-error"><ErrorState message="页面无法打开，请返回首页后重试。" /></div>,
    children: [
      { index: true, element: <LazyPage><DashboardPage /></LazyPage> },
      { path: "today", element: <Navigate to="/" replace /> },
      { path: "media", element: <LazyPage><MediaPage /></LazyPage> },
      { path: "development", element: <LazyPage><DevelopmentPage /></LazyPage> },
      { path: "learning", element: <LazyPage><LearningPage /></LazyPage> },
      { path: "fitness", element: <LazyPage><FitnessPage /></LazyPage> },
      { path: "diet", element: <LazyPage><DietPage /></LazyPage> },
      { path: "entertainment", element: <LazyPage><EntertainmentPage /></LazyPage> },
      { path: "settings", element: <LazyPage><SettingsPage /></LazyPage> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
