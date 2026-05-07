import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Globe2, MapPin, TrendingUp, Clock, BarChart3, Filter } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface OverviewStats {
  totalFacilities: number;
  totalOperators: number;
  totalCountries: number;
  facilitiesWithCapacity: number;
  lastUpdated: string | null;
}

interface Operator {
  operatorName: string;
  facilityCount: number;
}

interface Region {
  country: string;
  facilityCount: number;
}

interface Facility {
  id: string;
  operatorName: string;
  facilityName: string;
  region: string;
  country: string;
  mwDeployed: number | null;
  confidence: string;
  lat: number;
  lng: number;
  city: string;
}

const COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
];

export default function DcMarket() {
  const [selectedOperators, setSelectedOperators] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [showOnlyWithCapacity, setShowOnlyWithCapacity] = useState(false);

  const { data: overview } = useQuery<OverviewStats>({
    queryKey: ["/api/dc-market/overview"],
  });

  const { data: operatorsData } = useQuery<{ operators: Operator[] }>({
    queryKey: ["/api/dc-market/operators"],
  });

  const { data: regionsData } = useQuery<{ regions: Region[] }>({
    queryKey: ["/api/dc-market/regions"],
  });

  const { data: facilitiesData } = useQuery<{ facilities: Facility[] }>({
    queryKey: ["/api/dc-market/facilities-map"],
  });

  const operators = operatorsData?.operators || [];
  const regions = regionsData?.regions || [];
  const allFacilities = facilitiesData?.facilities || [];

  // Get unique operators and countries from map data
  const uniqueOperators = useMemo(() => {
    return Array.from(new Set(allFacilities.map(f => f.operatorName))).sort();
  }, [allFacilities]);

  const uniqueCountries = useMemo(() => {
    return Array.from(new Set(allFacilities.map(f => f.country))).sort();
  }, [allFacilities]);

  // Apply filters
  const filteredFacilities = useMemo(() => {
    return allFacilities.filter(f => {
      if (selectedOperators.length > 0 && !selectedOperators.includes(f.operatorName)) return false;
      if (selectedCountries.length > 0 && !selectedCountries.includes(f.country)) return false;
      if (showOnlyWithCapacity && !f.mwDeployed) return false;
      return true;
    });
  }, [allFacilities, selectedOperators, selectedCountries, showOnlyWithCapacity]);

  // Filter charts based on filters
  const filteredOperatorCounts = useMemo(() => {
    if (selectedOperators.length === 0 && selectedCountries.length === 0 && !showOnlyWithCapacity) {
      return operators.slice(0, 10);
    }
    
    const counts = filteredFacilities.reduce((acc, f) => {
      acc[f.operatorName] = (acc[f.operatorName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts)
      .map(([operatorName, facilityCount]) => ({ operatorName, facilityCount }))
      .sort((a, b) => b.facilityCount - a.facilityCount)
      .slice(0, 10);
  }, [filteredFacilities, operators, selectedOperators, selectedCountries, showOnlyWithCapacity]);

  const filteredRegionCounts = useMemo(() => {
    if (selectedOperators.length === 0 && selectedCountries.length === 0 && !showOnlyWithCapacity) {
      return regions.slice(0, 10);
    }

    const counts = filteredFacilities.reduce((acc, f) => {
      acc[f.country] = (acc[f.country] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts)
      .map(([country, facilityCount]) => ({ country, facilityCount }))
      .sort((a, b) => b.facilityCount - a.facilityCount)
      .slice(0, 10);
  }, [filteredFacilities, regions, selectedOperators, selectedCountries, showOnlyWithCapacity]);

  const toggleOperator = (op: string) => {
    setSelectedOperators(prev => 
      prev.includes(op) ? prev.filter(o => o !== op) : [...prev, op]
    );
  };

  const toggleCountry = (country: string) => {
    setSelectedCountries(prev =>
      prev.includes(country) ? prev.filter(c => c !== country) : [...prev, country]
    );
  };

  const clearFilters = () => {
    setSelectedOperators([]);
    setSelectedCountries([]);
    setShowOnlyWithCapacity(false);
  };

  const hasActiveFilters = selectedOperators.length > 0 || selectedCountries.length > 0 || showOnlyWithCapacity;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Data Centre Market Intelligence
          </h1>
          <p className="text-lg text-slate-600">
            Real-time visibility into global colocation infrastructure
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Facilities</CardTitle>
              <Building2 className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">
                {overview?.totalFacilities || 0}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Across {overview?.totalOperators || 0} operators
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Global Coverage</CardTitle>
              <Globe2 className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">
                {overview?.totalCountries || 0}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Countries with facilities
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Capacity Data</CardTitle>
              <TrendingUp className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">
                {overview?.facilitiesWithCapacity || 0}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Facilities with MW capacity
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Last Updated</CardTitle>
              <Clock className="h-4 w-4 text-slate-600" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold text-slate-900">
                {overview?.lastUpdated
                  ? new Date(overview.lastUpdated).toLocaleDateString()
                  : 'N/A'}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Data freshness indicator
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-slate-600" />
              Filters
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="ml-auto text-sm text-blue-600 hover:text-blue-800"
                >
                  Clear All
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Operator filter */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Operators ({selectedOperators.length} selected)
                </label>
                <div className="flex flex-wrap gap-2">
                  {uniqueOperators.map(op => (
                    <button
                      key={op}
                      onClick={() => toggleOperator(op)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        selectedOperators.includes(op)
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      {op}
                    </button>
                  ))}
                </div>
              </div>

              {/* Country filter */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Countries ({selectedCountries.length} selected)
                </label>
                <div className="flex flex-wrap gap-2">
                  {uniqueCountries.map(country => (
                    <button
                      key={country}
                      onClick={() => toggleCountry(country)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        selectedCountries.includes(country)
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      {country}
                    </button>
                  ))}
                </div>
              </div>

              {/* Capacity filter */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOnlyWithCapacity}
                    onChange={(e) => setShowOnlyWithCapacity(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    Show only facilities with capacity data
                  </span>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Map */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-emerald-600" />
              Facility Locations ({filteredFacilities.length} facilities)
            </CardTitle>
            <CardDescription>
              Interactive map showing data centre locations globally
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[500px] rounded-lg overflow-hidden">
              <MapContainer
                center={[20, 0]}
                zoom={2}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {filteredFacilities.map(facility => (
                  <Marker
                    key={facility.id}
                    position={[facility.lat, facility.lng]}
                  >
                    <Popup>
                      <div className="p-2">
                        <h3 className="font-bold text-slate-900">{facility.facilityName}</h3>
                        <p className="text-sm text-slate-600">{facility.operatorName}</p>
                        <p className="text-sm text-slate-600">{facility.country}</p>
                        {facility.mwDeployed && (
                          <p className="text-sm text-emerald-600 font-semibold mt-1">
                            {facility.mwDeployed} MW
                          </p>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </CardContent>
        </Card>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Operators Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-600" />
                Top Operators by Facility Count
              </CardTitle>
              <CardDescription>
                {hasActiveFilters ? 'Filtered results' : 'Leading data centre operators globally'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={filteredOperatorCounts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#64748b" />
                  <YAxis 
                    dataKey="operatorName" 
                    type="category" 
                    width={150}
                    stroke="#64748b"
                    style={{ fontSize: '12px' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff', 
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="facilityCount" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Regions Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-emerald-600" />
                Facilities by Country
              </CardTitle>
              <CardDescription>
                {hasActiveFilters ? 'Filtered geographic distribution' : 'Geographic distribution of facilities'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
  <PieChart>
    <Pie
      data={filteredRegionCounts}
      cx="50%"
      cy="45%"
      labelLine={true}
      label={(entry) => `${entry.country}: ${entry.facilityCount}`}
      outerRadius={100}
      fill="#8884d8"
      dataKey="facilityCount"
    >
      {filteredRegionCounts.map((entry, index) => (
        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
      ))}
    </Pie>
    <Tooltip 
      contentStyle={{ 
        backgroundColor: '#fff', 
        border: '1px solid #e2e8f0',
        borderRadius: '8px'
      }}
    />
    <Legend 
      verticalAlign="bottom" 
      height={60}
      wrapperStyle={{ fontSize: '14px' }}
    />
  </PieChart>
</ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-slate-500">
          <p>
            Data sourced from public operator websites and filings. Updated weekly.
          </p>
          <p className="mt-1">
            Powered by 1GigLabs Market Intelligence Platform
          </p>
        </div>
      </div>
    </div>
  );
}
