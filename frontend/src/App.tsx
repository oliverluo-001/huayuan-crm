import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { useAuth, AuthProvider } from "@/contexts/AuthContext";
import { Shell } from "@/components/layout/Shell";
import { LoginScreen, SetupScreen } from "@/components/auth/AuthScreens";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { OpportunitiesPage } from "@/components/opportunities/OpportunitiesPage";
import { ProductsPage } from "@/components/products/ProductsPage";
import { QuotesPage } from "@/components/quotes/QuotesPage";
import { SamplesPage } from "@/components/samples/SamplesPage";
import { MarketingPage } from "@/components/marketing/MarketingPage";
import { LeadsPage } from "@/components/leads/LeadsPage";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { Toaster } from "@/components/ui/sonner";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, needsSetup, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, needsSetup, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (needsSetup && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginScreen />
          </PublicRoute>
        }
      />
      <Route
        path="/setup"
        element={
          <PublicRoute>
            <SetupScreen />
          </PublicRoute>
        }
      />
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