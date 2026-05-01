import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

const ITEMS_TABLE = "items";

const buildChannelName = () =>
  `menu-items-${Math.random().toString(36).slice(2)}`;

function groupMenuItems(rows = []) {
  const grouped = {};

  for (const item of rows) {
    const category = String(item?.category ?? "").trim() || "Other";

    if (!grouped[category]) {
      grouped[category] = [];
    }

    grouped[category].push(item);
  }

  return Object.entries(grouped).map(([label, items]) => ({ label, items }));
}

export function useLiveMenuItems() {
  const [categories, setCategories] = useState([]);
  const [activeItemIds, setActiveItemIds] = useState([]);
  const [initializing, setInitializing] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    const fetchMenuItems = async () => {
      const { data, error } = await supabase
        .from(ITEMS_TABLE)
        .select("id, key, label, category")
        .eq("active", true)
        .order("category")
        .order("label");

      if (!isActive) {
        return;
      }

      if (error || !data) {
        setErrorMessage("Failed to load menu items.");
        setInitializing(false);
        return;
      }

      setCategories(groupMenuItems(data));
      setActiveItemIds(data.map((item) => item.id));
      setErrorMessage("");
      setInitializing(false);
    };

    void fetchMenuItems();

    const channel = supabase
      .channel(buildChannelName())
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: ITEMS_TABLE,
        },
        () => {
          void fetchMenuItems();
        },
      )
      .subscribe();

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    categories,
    activeItemIds,
    initializing,
    errorMessage,
  };
}
