// A stand-in for the hashed Angular bundle, so SpaFallbackTest can tell an
// asset that exists from one that does not. Committed rather than written at
// run time: the real bundle only exists after `-Pweb`, and the directory it
// would be written into is shared with the index.html that RecipeMetadataTest
// reads at context startup.
console.log('bundle');
