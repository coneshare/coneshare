import { useEffect, useState, useRef } from "react";
import { jwtDecode } from "jwt-decode";
import { toast } from "sonner";
import { useUser } from "../contexts/UserProvider";
import { getUser, updateUser } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/Avatar";
import { SettingsTabs } from "../components/settings/SettingsTabs";

function UserSettingsPage() {
  const { refreshUser } = useUser();
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef(null);


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
            setName(response.data.name || "");
            setAvatarPreview(response.data.avatar_url || null);
          }
        } catch (error) {
          if (isMounted) {
            console.error("Failed to fetch user:", error);
            toast.error("Failed to load user data.");
          }
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      } else {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    fetchUser();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    // This effect is for cleaning up the blob URL to prevent memory leaks.
    if (avatarPreview && avatarPreview.startsWith('blob:')) {
      return () => {
        URL.revokeObjectURL(avatarPreview);
      };
    }
  }, [avatarPreview]);

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAvatarFile(file);
      setIsRemovingAvatar(false);
      const previewUrl = URL.createObjectURL(file);
      setAvatarPreview(previewUrl);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setIsRemovingAvatar(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    const formData = new FormData();
    formData.append("name", name);
    if (avatarFile) {
      formData.append("avatar", avatarFile);
    } else if (isRemovingAvatar) {
      formData.append("avatar", ""); // Empty value signals removal
    }

    try {
      const response = await updateUser(user.id, formData);
      setUser(response.data);
      setName(response.data.name || "");
      setAvatarPreview(response.data.avatar_url || null);
      setAvatarFile(null); // Reset file input state
      setIsRemovingAvatar(false); // Reset removal state
      toast.success("Settings updated successfully!");
      refreshUser(response.data);
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
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">User Settings</h1>
        <SettingsTabs />
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
            <Label>Avatar</Label>
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarPreview} />
                <AvatarFallback>{name?.charAt(0) || "?"}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current.click()}
                >
                  Change
                </Button>
                {/* {avatarPreview && ( */}
                {/*   <Button */}
                {/*     type="button" */}
                {/*     variant="ghost" */}
                {/*     onClick={handleRemoveAvatar} */}
                {/*   > */}
                {/*     Remove */}
                {/*   </Button> */}
                {/* )} */}
              </div>
              <Input
                ref={fileInputRef}
                id="avatar"
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>
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
