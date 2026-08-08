import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { useAuth, AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";

const Shell = lazy(() => import("@/components/layout/Shell").then((module) => ({ default: module.Shell })));
const LoginScreen = lazy(() => import("@/components/auth/AuthScreens").then((module) => ({ default: module.LoginScreen })));
const Dashboard = lazy(() => import("@/components/dashboard/Dashboard").then((module) => ({ default: module.Dashboard })));
const CustomerTable = lazy(() => import("@/components/customers/CustomerTable").then((module) => ({ default: module.CustomerTable })));
const OpportunitiesPage = lazy(() => import("@/components/opportunities/OpportunitiesPage").then((module) => ({ default: module.OpportunitiesPage })));
const ProductsPage = lazy(() => import("@/components/products/ProductsPage").then((module) => ({ default: module.ProductsPage })));
const QuotesPage = lazy(() => import("@/components/quotes/QuotesPage").then((module) => ({ default: module.QuotesPage })));
const SamplesPage = lazy(() => import("@/components/samples/SamplesPage").then((module) => ({ default: module.SamplesPage })));
const MarketingPage = lazy(() => import("@/components/marketing/MarketingPage").then((module) => ({ default: module.MarketingPage })));
const LeadsPage = lazy(() => import("@/components/leads/LeadsPage").then((module) => ({ default: module.LeadsPage })));
const SettingsPage = lazy(() => import("@/components/settings/SettingsPage").then((module) => ({ default: module.SettingsPage })));

function RouteLoading() {
  return <div className="flex min-h-48 items-center justify-center text-muted-foreground">页面加载中...</div>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginScreen />
          </PublicRoute>
        }
      />
      <Route path="/setup" element={<Navigate to="/login" replace />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Shell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<CustomerTable />} />
        <Route path="opportunities" element={<OpportunitiesPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="quotes" element={<QuotesPage />} />
        <Route path="samples" element={<SamplesPage />} />
        <Route path="marketing" element={<MarketingPage />} />
        <Route path="acquisition" element={<LeadsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
