import { CheckCircle, AlertTriangle, Circle } from "lucide-react";

export const getStatusIcon = (status) => {
  switch (status) {
    case "full":
      return <CheckCircle size={16} className="status-icon full" />;
    case "low":
      return <AlertTriangle size={16} className="status-icon low" />;
    case "out_of_stock":
      return <Circle size={16} className="status-icon out" />;
    default:
      return <Circle size={16} />;
  }
};

export const getStatusLabel = (status) => {
  switch (status) {
    case "full": return "In Stock";
    case "low": return "Low";
    case "out_of_stock": return "Out";
    default: return status;
  }
};

export const isExpiringSoon = (expirationDate) => {
  if (!expirationDate) return false;
  const expDate = new Date(expirationDate);
  const today = new Date();
  const daysUntilExpiry = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
  return daysUntilExpiry <= 7 && daysUntilExpiry >= 0;
};

export const isExpired = (expirationDate) => {
  if (!expirationDate) return false;
  const expDate = new Date(expirationDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expDate < today;
};
