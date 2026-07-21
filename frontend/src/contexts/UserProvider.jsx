import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { getUser } from "../services/api";
import { authService } from "../services/authService";

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  const handleLogout = useCallback(async () => {
    await authService.logout();
    setUser(null);
    navigate("/login");
  }, [navigate]);

  const refreshUser = useCallback(async (updatedUserData = null) => {
    if (updatedUserData) {
      setUser(updatedUserData);
      return;
    }
    const token = localStorage.getItem("access_token");
    if (token) {
      try {
        const decoded = jwtDecode(token);
        const response = await getUser(decoded.user_id);
        setUser(response.data);
      } catch (error) {
        console.error("Failed to refresh user:", error);
        if (error.response?.status === 401) {
          handleLogout();
        }
      }
    }
  }, [handleLogout]);

  useEffect(() => {
    let isMounted = true;
    const fetchUser = async () => {
      const token = localStorage.getItem("access_token");
      if (token) {
        try {
          const decoded = jwtDecode(token);
          const response = await getUser(decoded.user_id);
          if (isMounted) {
            setUser(response.data);
          }
        } catch (error) {
          console.error("Failed to fetch user:", error);
          if (isMounted && error.response?.status === 401) {
            handleLogout();
          }
        }
      }
    };
    fetchUser();
    return () => { isMounted = false; };
  }, [handleLogout]);

  const value = { user, handleLogout, refreshUser };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
