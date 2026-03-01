/**
 * PantryFilters.jsx - Search, category, status, and sort controls for the pantry.
 *
 * A controlled component that receives filter/sort state and callbacks from the
 * parent Pantry component. All filtering is server-side; these controls update
 * the query parameters passed to the pantry data hooks.
 */
import { Search, ArrowUpDown } from "lucide-react";
import { PANTRY_CATEGORIES } from "../constants/pantryCategories";
import "./Pantry.css";

interface Props {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
}

const PantryFilters: React.FC<Props> = ({
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  statusFilter,
  onStatusChange,
  sortBy,
  onSortChange,
}) => {
  return (
    <div className="pantry-controls">
      <div className="search-container">
        <Search size={18} className="search-icon" />
        <input
          type="text"
          className="search-input"
          placeholder="Search pantry..."
          value={searchQuery}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="filter-controls">
        <select
          value={categoryFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onCategoryChange(e.target.value)}
        >
          <option value="">All Categories</option>
          {PANTRY_CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onStatusChange(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="full">In Stock</option>
          <option value="low">Low Stock</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>
        <div className="sort-control">
          <ArrowUpDown size={16} />
          <select
            value={sortBy}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSortChange(e.target.value)}
          >
            <option value="name">Name</option>
            <option value="category">Category</option>
            <option value="expiration_date">Expiration</option>
            <option value="stock_status">Status</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default PantryFilters;
