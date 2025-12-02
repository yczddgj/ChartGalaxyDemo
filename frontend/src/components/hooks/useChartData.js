import { useState, useCallback } from 'react';
import axios from 'axios';
import { CHART_TYPES_PER_PAGE, VARIATIONS_PER_PAGE, REFERENCES_PER_PAGE } from '../constants';

export function useChartData() {
  // Chart Types
  const [chartTypes, setChartTypes] = useState([]);
  const [totalChartTypes, setTotalChartTypes] = useState(0);
  const [selectedChartType, setSelectedChartType] = useState('');
  const [chartTypePage, setChartTypePage] = useState(0);
  const [chartTypesLoading, setChartTypesLoading] = useState(false);
  const [chartTypesLoadingText, setChartTypesLoadingText] = useState('');

  // Variations
  const [variations, setVariations] = useState([]);
  const [totalVariations, setTotalVariations] = useState(0);
  const [selectedVariation, setSelectedVariation] = useState('');
  const [variationPage, setVariationPage] = useState(0);
  const [variationLoading, setVariationLoading] = useState(false);
  const [variationLoadingText, setVariationLoadingText] = useState('');

  // References
  const [references, setReferences] = useState([]);
  const [totalReferences, setTotalReferences] = useState(0);
  const [referencePage, setReferencePage] = useState(0);
  const [selectedReference, setSelectedReference] = useState('');
  const [referenceProcessing, setReferenceProcessing] = useState(false);
  const [referenceProcessingText, setReferenceProcessingText] = useState('');

  // Poll status helper
  const pollStatus = useCallback((callback, targetStep, autoStopLoading = true, setLoading = null, setLoadingText = null) => {
    const interval = setInterval(async () => {
      try {
        const res = await axios.get('/api/status');
        const { completed, step } = res.data;

        if (targetStep && step !== targetStep) {
          return;
        }

        if (completed) {
          clearInterval(interval);
          if (autoStopLoading && setLoading) {
            setLoading(false);
          }
          // Await callback if it's async
          const result = callback(res.data);
          if (result && typeof result.then === 'function') {
            await result;
          }
        }
      } catch (err) {
        clearInterval(interval);
        if (setLoading) {
          setLoading(false);
        }
      }
    }, 500);
  }, []);

  // Chart Types functions
  const fetchChartTypes = useCallback(async () => {
    setChartTypesLoading(true);
    setChartTypesLoadingText('Loading chart types...');
    try {
      const res = await axios.get('/api/chart_types');
      setTotalChartTypes(res.data.total);
      setChartTypes(res.data.chart_types);
      setChartTypesLoading(false);
    } catch (err) {
      console.error(err);
      setChartTypesLoading(false);
    }
  }, []);

  const loadMoreChartTypes = useCallback(async (onSuccess) => {
    setChartTypesLoading(true);
    setChartTypesLoadingText('Loading more chart types...');
    try {
      const res = await axios.get('/api/chart_types/next');
      if (res.data.chart_types && res.data.chart_types.length > 0) {
        setChartTypes(prev => {
          const newItems = res.data.chart_types.filter(item => !prev.some(p => p.type === item.type));
          return [...prev, ...newItems];
        });
        if (onSuccess) onSuccess();
      }
      setChartTypesLoading(false);
    } catch (err) {
      console.error(err);
      setChartTypesLoading(false);
    }
  }, []);

  const handleChartTypeNext = useCallback(async () => {
    const maxLoadedPage = Math.ceil(chartTypes.length / CHART_TYPES_PER_PAGE) - 1;
    if (chartTypePage < maxLoadedPage) {
      setChartTypePage(p => p + 1);
    } else {
      await loadMoreChartTypes(() => {
        setChartTypePage(p => p + 1);
      });
    }
  }, [chartTypes.length, chartTypePage, loadMoreChartTypes]);

  const handleChartTypeSelect = useCallback(async (typeItem) => {
    const type = typeof typeItem === 'string' ? typeItem : typeItem.type;
    
    setSelectedVariation('');
    setVariations([]);
    setTotalVariations(0);
    setVariationPage(0);
    setSelectedReference('');
    setReferences([]);
    setTotalReferences(0);
    setReferencePage(0);

    setSelectedChartType(type);
    setVariationLoading(true);
    setVariationLoadingText('Loading variations...');
    try {
      await axios.get(`/api/chart_types/select/${type}`);
      await fetchVariations();
    } catch (err) {
      console.error(err);
      setVariationLoading(false);
    }
  }, []);

  // Variations functions
  const fetchVariations = useCallback(async () => {
    setVariationLoading(true);
    setVariationLoadingText('Generating variation previews...');
    try {
      const res = await axios.get('/api/variations');
      setTotalVariations(res.data.total);
      await axios.get('/api/variations/generate_previews');
      
      pollStatus((statusData) => {
        const filtered = (res.data.variations || []).filter(v => !v.name.toLowerCase().includes('plain'));
        setVariations(filtered);
        setVariationLoading(false);
      }, 'variation_preview', true, setVariationLoading);
    } catch (err) {
      console.error(err);
      setVariationLoading(false);
    }
  }, [pollStatus]);

  const loadMoreVariations = useCallback(async (onSuccess) => {
    setVariationLoading(true);
    setVariationLoadingText('Loading more variations...');
    try {
      const res = await axios.get('/api/variations/next');
      if (res.data.variations && res.data.variations.length > 0) {
        await axios.get('/api/variations/generate_previews');
        pollStatus(() => {
          setVariations(prev => {
            const validNewItems = res.data.variations.filter(v => !v.name.toLowerCase().includes('plain'));
            const newItems = validNewItems.filter(item => !prev.some(p => p.name === item.name));
            return [...prev, ...newItems];
          });
          if (onSuccess) onSuccess();
          setVariationLoading(false);
        }, 'variation_preview', true, setVariationLoading);
      } else {
        setVariationLoading(false);
      }
    } catch (err) {
      console.error(err);
      setVariationLoading(false);
    }
  }, [pollStatus]);

  const handleVariationNext = useCallback(async () => {
    const maxLoadedPage = Math.ceil(variations.length / VARIATIONS_PER_PAGE) - 1;
    if (variationPage < maxLoadedPage) {
      setVariationPage(p => p + 1);
    } else {
      await loadMoreVariations(() => {
        setVariationPage(p => p + 1);
      });
    }
  }, [variations.length, variationPage, loadMoreVariations]);

  const handleVariationSelect = useCallback(async (variationName) => {
    setSelectedReference('');
    setReferences([]);
    setTotalReferences(0);
    setReferencePage(0);
    setSelectedVariation(variationName);
    await fetchReferences();
  }, []);

  // References functions
  const fetchReferences = useCallback(async () => {
    try {
      const res = await axios.get('/api/references');
      const { main_image, random_images, total } = res.data;
      const allRefs = [main_image, ...(random_images || [])].filter(Boolean);
      setReferences(allRefs);
      setTotalReferences(total);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadMoreReferencesData = useCallback(async (onSuccess) => {
    setReferenceProcessing(true);
    setReferenceProcessingText('Loading more references...');
    try {
      const res = await axios.get('/api/references/next');
      const { random_images } = res.data;
      const newRefs = (random_images || []).filter(Boolean);
      
      if (newRefs.length > 0) {
        setReferences(prev => {
          const newItems = newRefs.filter(item => !prev.includes(item));
          return [...prev, ...newItems];
        });
        if (onSuccess) onSuccess();
      }
      setReferenceProcessing(false);
    } catch (err) {
      console.error(err);
      setReferenceProcessing(false);
    }
  }, []);

  const handleReferenceNext = useCallback(async () => {
    const maxLoadedPage = Math.ceil(references.length / REFERENCES_PER_PAGE) - 1;
    if (referencePage < maxLoadedPage) {
      setReferencePage(p => p + 1);
    } else {
      await loadMoreReferencesData(() => {
        setReferencePage(p => p + 1);
      });
    }
  }, [references.length, referencePage, loadMoreReferencesData]);

  const resetChartData = useCallback(() => {
    setSelectedChartType('');
    setChartTypes([]);
    setTotalChartTypes(0);
    setChartTypePage(0);
    setSelectedVariation('');
    setVariations([]);
    setTotalVariations(0);
    setVariationPage(0);
    setSelectedReference('');
    setReferences([]);
    setTotalReferences(0);
    setReferencePage(0);
  }, []);

  return {
    // Chart Types
    chartTypes,
    totalChartTypes,
    selectedChartType,
    chartTypePage,
    chartTypesLoading,
    chartTypesLoadingText,
    setChartTypePage,
    fetchChartTypes,
    handleChartTypeNext,
    handleChartTypeSelect,
    
    // Variations
    variations,
    totalVariations,
    selectedVariation,
    variationPage,
    variationLoading,
    variationLoadingText,
    setVariationPage,
    fetchVariations,
    handleVariationNext,
    handleVariationSelect,
    
    // References
    references,
    totalReferences,
    selectedReference,
    referencePage,
    referenceProcessing,
    referenceProcessingText,
    setSelectedReference,
    setReferencePage,
    setReferenceProcessing,
    setReferenceProcessingText,
    fetchReferences,
    handleReferenceNext,
    
    // Utilities
    pollStatus,
    resetChartData
  };
}

