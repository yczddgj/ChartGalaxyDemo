import { useState, useCallback } from 'react';
import axios from 'axios';

export function useAssets(selectedFile, pollStatus, selectedVariation) {
  const [titleImage, setTitleImage] = useState('');
  const [selectedPictograms, setSelectedPictograms] = useState([]);
  const [titleOptions, setTitleOptions] = useState([]);
  const [pictogramOptions, setPictogramOptions] = useState([]);
  const [titleLoading, setTitleLoading] = useState(false);
  const [titleLoadingText, setTitleLoadingText] = useState('');
  const [pictogramLoading, setPictogramLoading] = useState(false);
  const [pictogramLoadingText, setPictogramLoadingText] = useState('');
  const [previewTimestamp, setPreviewTimestamp] = useState(Date.now());

  const generatePictogram = useCallback(async (titleText, currentTitleImage = null) => {
    setPictogramLoading(true);
    setPictogramLoadingText('Generating pictogram...');
    try {
      const text = titleText || 'InfoGraphic'; 
      await axios.get(`/api/start_pictogram_generation/${encodeURIComponent(text)}`);
      pollStatus((statusData) => {
        let options = [];
        if (statusData.pictogram_options) {
          options = Object.keys(statusData.pictogram_options).sort();
        }
        
        if (options.length === 0) {
          console.warn('No pictogram options found in statusData');
          options = ['pictogram_0.png', 'pictogram_1.png', 'pictogram_2.png'];
        }

        setPictogramOptions(options);
        const newPictograms = [options[0]];
        
        if (currentTitleImage) {
          setTitleImage(currentTitleImage);
        }
        setSelectedPictograms(newPictograms);
        setPreviewTimestamp(Date.now());
        setPictogramLoading(false);
      }, 'pictogram_generation', true, setPictogramLoading);
    } catch (err) {
      console.error(err);
      setPictogramLoading(false);
    }
  }, [pollStatus]);

  const generateTitle = useCallback(async () => {
    setTitleLoading(true);
    setTitleLoadingText('Generating title...');
    try {
      await axios.get(`/api/start_title_generation/${selectedFile}`);
      pollStatus(async (statusData) => {
        const keys = statusData.title_options ? Object.keys(statusData.title_options).sort() : [];
        const options = keys.length > 0 ? keys : ['title_0.png'];
        setTitleOptions(options);
        const newTitleImage = options[0];
        setPreviewTimestamp(Date.now());
        
        const titleText = statusData.title_options && statusData.title_options[newTitleImage] 
          ? statusData.title_options[newTitleImage].title_text 
          : (statusData.selected_title || 'InfoGraphic');
        
        setTitleLoading(false);
        await generatePictogram(titleText, newTitleImage);
      }, 'title_generation', false, setTitleLoading);
    } catch (err) {
      console.error(err);
      setTitleLoading(false);
    }
  }, [selectedFile, pollStatus, generatePictogram]);

  const regenerateTitle = useCallback(async () => {
    setTitleLoading(true);
    setTitleLoadingText('Regenerating title...');
    try {
      await axios.get(`/api/regenerate_title/${selectedFile}`);
      pollStatus(async (statusData) => {
        const keys = statusData.title_options ? Object.keys(statusData.title_options).sort() : [];
        const options = keys.length > 0 ? keys : ['title_0.png'];
        setTitleOptions(options);
        setTitleImage(options[0]);
        setPreviewTimestamp(Date.now());
        setTitleLoading(false);
      }, 'title_generation', true, setTitleLoading);
    } catch (err) {
      console.error(err);
      setTitleLoading(false);
    }
  }, [selectedFile, pollStatus]);

  const regeneratePictogram = useCallback(async () => {
    setPictogramLoading(true);
    setPictogramLoadingText('Regenerating pictogram...');
    try {
      const text = 'InfoGraphic'; 
      await axios.get(`/api/regenerate_pictogram/${encodeURIComponent(text)}`);
      pollStatus((statusData) => {
        let options = [];
        if (statusData.pictogram_options) {
          options = Object.keys(statusData.pictogram_options).sort();
        }
        
        if (options.length === 0) {
          console.warn('No pictogram options found in statusData');
          options = ['pictogram_0.png', 'pictogram_1.png', 'pictogram_2.png'];
        }

        setPictogramOptions(options);
        setSelectedPictograms([options[0]]);
        setPreviewTimestamp(Date.now());
        setPictogramLoading(false);
      }, 'pictogram_generation', true, setPictogramLoading);
    } catch (err) {
      console.error(err);
      setPictogramLoading(false);
    }
  }, [pollStatus]);

  const resetAssets = useCallback(() => {
    setTitleImage('');
    setSelectedPictograms([]);
    setTitleOptions([]);
    setPictogramOptions([]);
  }, []);

  return {
    titleImage,
    setTitleImage,
    selectedPictograms,
    setSelectedPictograms,
    titleOptions,
    setTitleOptions,
    pictogramOptions,
    setPictogramOptions,
    titleLoading,
    titleLoadingText,
    pictogramLoading,
    pictogramLoadingText,
    previewTimestamp,
    generateTitle,
    regenerateTitle,
    generatePictogram,
    regeneratePictogram,
    resetAssets
  };
}

