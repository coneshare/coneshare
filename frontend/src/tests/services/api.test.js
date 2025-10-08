import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import api from "../../services/api";
import axios from "axios";

// Mock axios. The factory ensures that when api.js calls axios.create(), it gets
// a real axios instance, while the top-level axios.post used for token
// refresh remains a separate mock function.
vi.mock("axios", async (importOriginal) => {
  const actualAxios = await importOriginal();
  const mockCreatedInstance = actualAxios.default.create();

  return {
    default: {
      create: () => mockCreatedInstance,
      post: vi.fn(),
    },
  };
});

describe("API Service Interceptors", () => {
  let mockAdapter;
  let originalWindowLocation;

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();

    // Spy on localStorage to track calls
    vi.spyOn(Storage.prototype, "removeItem");

    // Mock the adapter for the 'api' instance to control its responses
    mockAdapter = vi.fn();
    api.defaults.adapter = mockAdapter;

    // Mock window.location for redirection tests
    originalWindowLocation = window.location;
    delete window.location;
    window.location = {
      href: "",
    };
  });

  afterEach(() => {
    window.location = originalWindowLocation;
  });

  describe("Request Interceptor", () => {
    it("should add Authorization header if access token exists", async () => {
      localStorage.setItem("access_token", "test_token");
      mockAdapter.mockResolvedValue({ data: "success" });

      await api.get("/test");

      const requestConfig = mockAdapter.mock.calls[0][0];
      expect(requestConfig.headers.Authorization).toBe("Bearer test_token");
    });

    it("should not add Authorization header if no access token exists", async () => {
      mockAdapter.mockResolvedValue({ data: "success" });

      await api.get("/test");

      const requestConfig = mockAdapter.mock.calls[0][0];
      expect(requestConfig.headers.Authorization).toBeUndefined();
    });
  });

  describe("Response Interceptor", () => {
    it("should refresh token and retry original request on 401", async () => {
      localStorage.setItem("refresh_token", "test_refresh_token");

      // Mock the first API call to fail with 401
      mockAdapter.mockRejectedValueOnce({
        response: { status: 401 },
        config: { url: "/protected", headers: {} },
      });

      // Mock the successful retry
      mockAdapter.mockResolvedValueOnce({ data: "success" });

      // Mock the refresh token call to succeed
      axios.post.mockResolvedValue({
        data: { access: "new_access_token" },
      });

      const response = await api.get("/protected");

      // Verify refresh endpoint was called
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith("/api/v1/token/refresh/", {
        refresh: "test_refresh_token",
      });

      // Verify new token was stored
      expect(localStorage.getItem("access_token")).toBe("new_access_token");

      // Verify original request was retried with new token
      expect(mockAdapter).toHaveBeenCalledTimes(2);
      const retryConfig = mockAdapter.mock.calls[1][0];
      expect(retryConfig.headers.Authorization).toBe(
        "Bearer new_access_token"
      );

      // Verify final response is correct
      expect(response.data).toBe("success");
    });

    it("should redirect to login if refresh token call fails", async () => {
      localStorage.setItem("refresh_token", "test_refresh_token");
      const refreshError = new Error("Refresh failed");
      axios.post.mockRejectedValue(refreshError);

      mockAdapter.mockRejectedValue({
        response: { status: 401 },
        config: { url: "/protected" },
      });

      await expect(api.get("/protected")).rejects.toThrow(refreshError);

      expect(localStorage.removeItem).toHaveBeenCalledWith("access_token");
      expect(localStorage.removeItem).toHaveBeenCalledWith("refresh_token");
      expect(window.location.href).toBe("/login");
    });

    it("should redirect to login on 401 if no refresh token exists", async () => {
      const originalError = {
        response: { status: 401 },
        config: { url: "/protected" },
      };
      mockAdapter.mockRejectedValue(originalError);

      await expect(api.get("/protected")).rejects.toBe(originalError);

      expect(axios.post).not.toHaveBeenCalled();
      expect(window.location.href).toBe("/login");
      // With the new logic, tokens are not cleared if no refresh token is present,
      // as the user is simply redirected.
      expect(localStorage.removeItem).not.toHaveBeenCalled();
    });

    it("should handle multiple concurrent requests with a single token refresh", async () => {
      localStorage.setItem("refresh_token", "test_refresh_token");

      // Mock initial failed requests.
      const error401 = {
        response: { status: 401 },
        config: { headers: {}, url: '/protected' },
      };
      mockAdapter.mockRejectedValueOnce(error401); // for /protected1
      mockAdapter.mockRejectedValueOnce(error401); // for /protected2

      // Mock successful retries.
      mockAdapter.mockResolvedValue({ data: "success" });

      // Mock successful token refresh.
      axios.post.mockResolvedValue({
        data: { access: "new_access_token" },
      });

      // Fire two requests concurrently.
      const promise1 = api.get("/protected1");
      const promise2 = api.get("/protected2");

      const [response1, response2] = await Promise.all([promise1, promise2]);

      // Verify that refresh was only called once for both requests.
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith("/api/v1/token/refresh/", {
        refresh: "test_refresh_token",
      });

      // Verify both requests eventually succeeded.
      expect(response1.data).toBe("success");
      expect(response2.data).toBe("success");

      // Verify new token was stored.
      expect(localStorage.getItem("access_token")).toBe("new_access_token");
    });
  });
});
