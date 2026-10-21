export const SIDEBAR_KEY = 'margins:sidebar'

/** Runs before first paint so a collapsed sidebar never flashes open. */
export const SIDEBAR_INIT_SCRIPT = `try{if(localStorage.getItem('${SIDEBAR_KEY}')==='collapsed')document.documentElement.dataset.sidebar='collapsed'}catch(e){}`
