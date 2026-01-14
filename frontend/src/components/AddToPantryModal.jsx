import { useState } from "react";
import { Package, X, Check, Plus, Trash2 } from "lucide-react";
import { PANTRY_CATEGORIES } from "../constants/pantryCategories";
import "./AddToPantryModal.css";

const AddToPantryModal = ({ expense, onClose, onSuccess, token }) => {
  // Parse quantity and unit from item string like "6 chocolates", "2 lbs chicken", "12 eggs"
  const parseQuantityFromItem = (itemStr) => {
    const trimmed = itemStr.trim();

    // Pattern 1: "6 chocolates", "12 eggs", "2 bags of chips"
    const leadingNumMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.+)$/);
    if (leadingNumMatch) {
      const qty = parseFloat(leadingNumMatch[1]);
      let rest = leadingNumMatch[2].trim();

      // Check for unit words: "2 lbs chicken", "3 bags of rice"
      const unitMatch = rest.match(
        /^(lbs?|oz|kg|g|gallons?|liters?|bags?|boxes?|cans?|bottles?|packs?|dozen)\s+(?:of\s+)?(.+)$/i
      );
      if (unitMatch) {
        return { quantity: qty, unit: unitMatch[1], name: unitMatch[2] };
      }
      return { quantity: qty, unit: "", name: rest };
    }

    // Pattern 2: "chocolates x6", "eggs x12"
    const trailingXMatch = trimmed.match(/^(.+?)\s*x\s*(\d+(?:\.\d+)?)$/i);
    if (trailingXMatch) {
      return {
        quantity: parseFloat(trailingXMatch[2]),
        unit: "",
        name: trailingXMatch[1].trim(),
      };
    }

    // Pattern 3: "chocolates (6)", "eggs (12)"
    const parenMatch = trimmed.match(/^(.+?)\s*\((\d+(?:\.\d+)?)\)$/);
    if (parenMatch) {
      return {
        quantity: parseFloat(parenMatch[2]),
        unit: "",
        name: parenMatch[1].trim(),
      };
    }

    // No quantity found
    return { quantity: 1, unit: "", name: trimmed };
  };

  // Auto-detect category based on item name
  const detectCategory = (itemName) => {
    let name = itemName.toLowerCase().trim();

    // Normalize plural forms: remove trailing 's' or 'es' for better matching
    // "bagels" -> "bagel", "muffins" -> "muffin", "cookies" -> "cookie"
    const normalizedName = name.replace(/(es|s)$/, "");

    // Helper to check if name matches (tries both original and normalized)
    const matches = (pattern) => {
      return pattern.test(name) || pattern.test(normalizedName);
    };

    // Dairy
    if (
      matches(
        /\b(milk|cheese|yogurt|butter|cream|egg|cottage|sour cream|whipping cream|half and half|creamer)\b/
      )
    ) {
      return "Dairy";
    }

    // Produce (fruits and vegetables)
    if (
      matches(
        /\b(apple|banana|orange|grape|strawberr|blueberr|raspberr|lemon|lime|mango|pineapple|watermelon|cantaloupe|peach|pear|plum|cherry|kiwi|avocado|tomato|potato|onion|garlic|carrot|celery|lettuce|spinach|kale|broccoli|cauliflower|pepper|cucumber|zucchini|squash|corn|bean|pea|mushroom|cabbage|asparagus|artichoke|beet|radish|turnip|eggplant|ginger|cilantro|parsley|basil|mint|fruit|vegetable|veggie|salad|greens)\b/
      )
    ) {
      return "Produce";
    }

    // Meat & Seafood
    if (
      matches(
        /\b(chicken|beef|pork|steak|ground|turkey|lamb|bacon|sausage|ham|meat|fish|salmon|tuna|shrimp|crab|lobster|scallop|clam|mussel|oyster|seafood|tilapia|cod|halibut)\b/
      )
    ) {
      return "Meat & Seafood";
    }

    // Bakery - this is where "bagels" should match "bagel"
    if (
      matches(
        /\b(bread|bagel|muffin|croissant|donut|doughnut|roll|bun|cake|pie|pastry|cookie|brownie|cupcake|baguette|tortilla|pita|naan|wrap)\b/
      )
    ) {
      return "Bakery";
    }

    // Frozen
    if (
      matches(
        /\b(frozen|ice cream|popsicle|pizza|waffle|fries|nugget|burrito|dinner|meal)\b/
      )
    ) {
      return "Frozen";
    }

    // Canned Goods
    if (
      matches(
        /\b(canned|can of|soup|broth|stock|bean|tomato|corn|tuna|sardine|spam|chili)\b/
      )
    ) {
      return "Canned Goods";
    }

    // Snacks
    if (
      matches(
        /\b(chip|crisp|pretzel|popcorn|cracker|cookie|candy|chocolate|gummy|snack|nut|almond|cashew|peanut|walnut|pistachio|trail mix|granola bar|protein bar|jerky)\b/
      )
    ) {
      return "Snacks";
    }

    // Beverages
    if (
      matches(
        /\b(water|juice|soda|pop|cola|coffee|tea|beer|wine|alcohol|drink|beverage|smoothie|shake|lemonade|energy drink|sports drink|kombucha)\b/
      )
    ) {
      return "Beverages";
    }

    // Condiments
    if (
      matches(
        /\b(ketchup|mustard|mayo|mayonnaise|sauce|dressing|vinegar|oil|olive oil|soy sauce|hot sauce|salsa|relish|pickle|jam|jelly|honey|syrup|peanut butter|nutella|spread)\b/
      )
    ) {
      return "Condiments";
    }

    // Grains & Pasta
    if (
      matches(
        /\b(pasta|spaghetti|noodle|rice|quinoa|oat|oatmeal|cereal|flour|bread crumb|couscous|barley|grain|macaroni|penne|fettuccine|linguine|ramen)\b/
      )
    ) {
      return "Grains & Pasta";
    }

    return "Other";
  };

  // Parse items from expense.items (comma-separated)
  const parseItems = (itemsString) => {
    if (!itemsString) return [];
    return itemsString.split(",").map((item, index) => {
      const parsed = parseQuantityFromItem(item);
      return {
        id: index,
        name: parsed.name,
        quantity: parsed.quantity,
        unit: parsed.unit,
        category: detectCategory(parsed.name),
        expiration_date: "",
        selected: true,
      };
    });
  };

  const [items, setItems] = useState(parseItems(expense?.items));
  const [submitting, setSubmitting] = useState(false);

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const toggleItemSelection = (index) => {
    const newItems = [...items];
    newItems[index].selected = !newItems[index].selected;
    setItems(newItems);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        id: Date.now(),
        name: "",
        quantity: 1,
        unit: "",
        category: "Other",
        expiration_date: "",
        selected: true,
      },
    ]);
  };

  const handleSubmit = async () => {
    const selectedItems = items.filter((i) => i.selected && i.name.trim());

    if (selectedItems.length === 0) {
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(
        "http://localhost:8000/api/pantry/from-expense",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            expense_id: expense.id,
            items: selectedItems.map((item) => ({
              name: item.name.trim(),
              quantity: item.quantity,
              unit: item.unit || null,
              category: item.category,
              expiration_date: item.expiration_date || null,
            })),
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (onSuccess) onSuccess(data);
        onClose();
      } else {
        console.error("Failed to add items to pantry");
      }
    } catch (error) {
      console.error("Error adding to pantry:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCount = items.filter((i) => i.selected).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Package size={24} />
            <h3>Add to Pantry</h3>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            Select items from your grocery purchase to add to your pantry:
          </p>

          <div className="expense-info">
            <span className="store-name">{expense?.store}</span>
            <span className="expense-date">{expense?.date}</span>
          </div>

          <div className="pantry-items-list">
            {items.map((item, index) => (
              <div
                key={item.id}
                className={`pantry-item-row ${
                  item.selected ? "selected" : ""
                }`}>
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={() => toggleItemSelection(index)}
                  className="item-checkbox"
                />
                <div className="item-fields">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) =>
                      handleItemChange(index, "name", e.target.value)
                    }
                    placeholder="Item name"
                    className="item-name-input"
                  />
                  <div className="item-details">
                    <div className="detail-field">
                      <label>Qty</label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          handleItemChange(
                            index,
                            "quantity",
                            parseFloat(e.target.value) || 1
                          )
                        }
                        min="0"
                        step="0.1"
                        className="item-quantity-input"
                      />
                    </div>
                    <div className="detail-field">
                      <label>Unit</label>
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) =>
                          handleItemChange(index, "unit", e.target.value)
                        }
                        placeholder="lbs, oz..."
                        className="item-unit-input"
                      />
                    </div>
                    <div className="detail-field">
                      <label>Category</label>
                      <select
                        value={item.category}
                        onChange={(e) =>
                          handleItemChange(index, "category", e.target.value)
                        }
                        className="item-category-select">
                        {PANTRY_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="detail-field">
                      <label>Expires</label>
                      <input
                        type="date"
                        value={item.expiration_date}
                        onChange={(e) =>
                          handleItemChange(
                            index,
                            "expiration_date",
                            e.target.value
                          )
                        }
                        className="item-expiry-input"
                      />
                    </div>
                  </div>
                </div>
                <button
                  className="remove-item-btn"
                  onClick={() => removeItem(index)}
                  title="Remove item">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <button className="add-more-btn" onClick={addItem}>
            <Plus size={16} />
            <span>Add Another Item</span>
          </button>
        </div>

        <div className="modal-footer">
          <button className="skip-btn" onClick={onClose}>
            Skip
          </button>
          <button
            className="confirm-btn"
            onClick={handleSubmit}
            disabled={submitting || selectedCount === 0}>
            {submitting ? (
              "Adding..."
            ) : (
              <>
                <Check size={16} />
                <span>
                  Add {selectedCount} Item{selectedCount !== 1 ? "s" : ""} to
                  Pantry
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddToPantryModal;
