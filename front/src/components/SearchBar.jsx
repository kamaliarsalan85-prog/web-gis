import React, { useState, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import axios from 'axios';
import { toast } from 'react-toastify';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { debounce } from 'lodash';

const SearchBar = () => {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const map = useMap();

  // Debounce برای جستجوی پیشنهادات
  const fetchSuggestions = useCallback(
    debounce(async (value) => {
      if (!value) {
        setSuggestions([]);
        return;
      }
      try {
        const response = await axios.get(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&limit=5`
        );
        setSuggestions(response.data || []);
      } catch (error) {
        setSuggestions([]);
      }
    }, 300),
    []
  );

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query) {
      toast.error('لطفاً یک عبارت جستجو وارد کنید', { autoClose: 2000 });
      setError('لطفاً یک عبارت جستجو وارد کنید');
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`
      );
      const result = response.data[0];
      if (result) {
        map.flyTo([parseFloat(result.lat), parseFloat(result.lon)], 14, { animate: true, duration: 1 });
        setError('');
        setSuggestions([]);
        toast.success(`مکان ${result.display_name} پیدا شد`, { autoClose: 2000 });
      } else {
        setError('مکان یافت نشد!');
        toast.error('مکان یافت نشد!', { autoClose: 2000 });
      }
    } catch (error) {
      setError('خطا در جستجو: لطفاً دوباره تلاش کنید');
      toast.error('خطا در جستجو: لطفاً دوباره تلاش کنید', { autoClose: 2000 });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    setError('');
    fetchSuggestions(value);
  };

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion.display_name);
    setSuggestions([]);
    map.flyTo([parseFloat(suggestion.lat), parseFloat(suggestion.lon)], 14, { animate: true, duration: 1 });
    toast.success(`مکان ${suggestion.display_name} انتخاب شد`, { autoClose: 2000 });
  };

  const handleClear = () => {
    setQuery('');
    setError('');
    setSuggestions([]);
  };

  return (
    <div className="hidden md:ms-0  relative w-8/12 md:w-full max-w-md mx-auto font-vazir">
      <form
        onSubmit={handleSearch}
        className="flex items-center gap-2 bg-white p-2 rounded-xl shadow-lg z-[1000]"
      > 
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder="جستجوی مکان..."
            className="w-full p-2 pr-8 border border-teal-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            aria-label="جستجوی مکان"
            aria-describedby="search-error"
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              aria-label="پاک کردن عبارت جستجو"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className={`flex items-center px-3 py-2 rounded-md text-white font-medium transition ${
            isLoading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-cyan-600 to-teal-500  hover:bg-blue-700 focus:ring-2 focus:ring-blue-500'
          }`}
          aria-label="انجام جستجو"
        >
          {isLoading ? (
            <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <>
              <MagnifyingGlassIcon className="w-4 h-4 ml-1" />
              جستجو
            </>
          )}
        </button>
      </form>
      {suggestions.length > 0 && (
        <ul className="absolute w-full max-w-md bg-white border border-gray-200 rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto z-[1001]">
          {suggestions.map((suggestion, index) => (
            <li
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-gray-700 text-sm"
              role="option"
              aria-selected={false}
            >
              {suggestion.display_name}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div
          id="search-error"
          className="absolute top-full mt-1 text-red-600 text-sm bg-white p-1 rounded-md shadow"
        >
          {error}
        </div>
      )}
    </div>
  );
};

export default SearchBar;