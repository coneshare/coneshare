import { useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { toast, Toaster } from "sonner";
import { getUser, updateUser } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";

function UserSettingsPage() {
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem("access_token");
      if (token) {
        try {
          const decoded = jwtDecode(token);
          const response = await getUser(decoded.user_id);
          setUser(response.data);
          setName(response.data.name || "");
          setAvatarUrl(response.data.avatar_url || "");
        } catch (error) {
          console.error("Failed to fetch user:", error);
          toast.error("Failed to load user data.");
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    };
    fetchUser();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updatedData = { name, avatar_url: avatarUrl };
      const response = await updateUser(user.id, updatedData);
      setUser(response.data);
      setName(response.data.name || "");
      setAvatarUrl(response.data.avatar_url || "");
      toast.success("Settings updated successfully!");
    } catch (error) {
      console.error("Failed to update user:", error);
      toast.error("Failed to update settings.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-4 sm:mx-4 sm:pt-8">Loading...</div>;
  }

  if (!user) {
    return <div className="p-4 sm:mx-4 sm:pt-8">Could not load user data.</div>;
  }

  return (
    <div className="p-4 sm:mx-4 sm:pt-8">
      <Toaster richColors />
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">User Settings</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={user.email}
              readOnly
              className="bg-gray-100 dark:bg-gray-800"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="avatarUrl">Avatar URL</Label>
            <Input
              id="avatarUrl"
              type="text"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.png"
            />
          </div>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default UserSettingsPage;
