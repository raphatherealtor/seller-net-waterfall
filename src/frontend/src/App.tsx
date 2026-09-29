import { AppLayout } from "@/components/layout/AppLayout";
import { ClientViewPage } from "@/pages/client-view";
import PrintViewPage from "@/pages/print-view";
import { SavedRunsPage } from "@/pages/saved-runs";
import { WorkSurfacePage } from "@/pages/work-surface";
import { SellerNetProvider } from "@/state/seller-net-context";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

/**
 * Router and providers only. Page bodies live in `src/pages/*` and are owned by
 * their own tasks; this file registers every route and the shared shell.
 */

const rootRoute = createRootRoute({
  component: () => (
    <SellerNetProvider>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </SellerNetProvider>
  ),
});

const workSurfaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: WorkSurfacePage,
});

const clientViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/client",
  component: ClientViewPage,
});

const printViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/print",
  component: PrintViewPage,
});

const savedRunsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs",
  component: SavedRunsPage,
});

const routeTree = rootRoute.addChildren([
  workSurfaceRoute,
  clientViewRoute,
  printViewRoute,
  savedRunsRoute,
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return <RouterProvider router={router} />;
}
