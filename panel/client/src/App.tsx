import { Routes, Route, BrowserRouter } from "react-router";
import Layout from "./components/Layout.tsx";
import LoginPage from "./pages/LoginPage.tsx";
import SignupPage from "./pages/SignupPage.tsx";
import ProductSearchPage from "./pages/ProductSearchPage.tsx";
import ProductDetailPage from "./pages/ProductDetailPage.tsx";
// import ReviewQueuePage from "./pages/ReviewQueuePage.tsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<ProductSearchPage />} />
          <Route path="/products/:id" element={<ProductDetailPage />} />
          {/* <Route path="/review-queue" element={<ReviewQueuePage />} /> */}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
