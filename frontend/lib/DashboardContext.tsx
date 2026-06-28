"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface LayersState {
  heat: boolean;
  ndvi: boolean;
  buildings: boolean;
}

interface DashboardContextType {
  selectedCity: string;
  setSelectedCity: (city: string) => void;
  stats: any;
  setStats: (stats: any) => void;
  zoneRankings: any[];
  setZoneRankings: (rankings: any[]) => void;
  selectedCell: any;
  setSelectedCell: (cell: any) => void;
  isPanelOpen: boolean;
  setIsPanelOpen: (open: boolean) => void;
  activeLayers: LayersState;
  setActiveLayers: (layers: LayersState | ((prev: LayersState) => LayersState)) => void;
  opacity: number;
  setOpacity: (opacity: number) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  loadingText: string;
  setLoadingText: (text: string) => void;
  driverData: any;
  setDriverData: (data: any) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedCity, setSelectedCityState] = useState("Pune, Maharashtra");
  const [stats, setStats] = useState<any>(null);
  const [zoneRankings, setZoneRankings] = useState<any[]>([]);
  const [selectedCell, setSelectedCell] = useState<any>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [activeLayers, setActiveLayers] = useState<LayersState>({
    heat: true,
    ndvi: false,
    buildings: false,
  });
  const [opacity, setOpacity] = useState(80);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState("Loading urban heat data...");
  const [driverData, setDriverData] = useState<any>(null);

  // Restore selected city name from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("selectedCityName");
    if (saved) {
      setSelectedCityState(saved);
    }
  }, []);

  const setSelectedCity = (city: string) => {
    setSelectedCityState(city);
    localStorage.setItem("selectedCityName", city);
  };

  return (
    <DashboardContext.Provider
      value={{
        selectedCity,
        setSelectedCity,
        stats,
        setStats,
        zoneRankings,
        setZoneRankings,
        selectedCell,
        setSelectedCell,
        isPanelOpen,
        setIsPanelOpen,
        activeLayers,
        setActiveLayers,
        opacity,
        setOpacity,
        loading,
        setLoading,
        loadingText,
        setLoadingText,
        driverData,
        setDriverData,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
};
