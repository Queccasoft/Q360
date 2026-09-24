const getObjectStore = async (dbName, dbVersion, storeName) => {
    // Return a new Promise to handle the asynchronous IndexedDB requests.
    return new Promise((resolve, reject) => {
        // 1. Open the database connection.
        const request = window.indexedDB.open(dbName, dbVersion);

        request.onerror = (event) => {
            console.error('Error opening database for retrieval:', event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            const db = event.target.result;

            try {
                // 2. Create a read-only transaction.
                const transaction = db.transaction([storeName], 'readonly');
                
                // 3. Get the object store.
                const store = transaction.objectStore(storeName);

                // 4. Use the getAll() method to retrieve all records.
                const getAllRequest = store.getAll();

                getAllRequest.onsuccess = (e) => {
                    // 5. If successful, resolve the Promise with the data.
                    // The `response` object in your calling code will be this object.
                    resolve({ data: e.target.result });
                };

                getAllRequest.onerror = (event) => {
                    // 6. If an error occurs, reject the Promise.
                    console.error('Error retrieving data:', event.target.error);
                    reject(event.target.error);
                };

                // 7. Close the database connection when the transaction is complete.
                transaction.oncomplete = () => {
                    db.close();
                };

                transaction.onerror = (event) => {
                    console.error('Transaction error:', event.target.error);
                    db.close();
                    reject(event.target.error);
                };

            } catch (error) {
                console.error(`Failed to create transaction for store "${storeName}":`, error);
                db.close();
                reject(error);
            }
        };

        request.onblocked = () => {
            console.warn(`Database "${dbName}" is blocked. Cannot open for retrieval.`);
            reject(new Error('Database open request is blocked.'));
        };
    });
};

const getValueByObjectStoreByKey = async (dbName, dbVersion, storeName, key) => {
    return new Promise(async (resolve, reject) => { // Mark the promise executor as async
      // 1. Open the database connection with the specified version
      const request = indexedDB.open(dbName, dbVersion);
  
      request.onerror = (event) => {
        console.error('Error opening database:', event.target.errorCode, event.target.error);
        reject(new Error('Error opening database for version ' + dbVersion));
      };
  
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log(`Database '${dbName}' upgrade needed from version ${event.oldVersion} to ${event.newVersion}`);
  
        if (!db.objectStoreNames.contains(storeName)) {
          console.log(`Creating object store '${storeName}' as part of upgrade.`);
          // Assuming 'id' is still the keyPath for the main data.
          // For TTLs, they might just be simple numbers stored directly.
          db.createObjectStore(storeName); // Create without keyPath if keys are arbitrary (e.g., "TTL"+key)
                                          // OR ensure 'id' is suitable for both data and TTL
        }
      };
  
      request.onsuccess = async (event) => { // Mark this onsuccess handler as async
        const db = event.target.result;
  
        if (db.version !== dbVersion) {
          console.warn(`Opened database '${dbName}' at version ${db.version}, but requested version ${dbVersion}.`);
        }
  
        // 2. Start a read-only transaction (or 'readwrite' if you plan to delete expired items)
        // For just getting and checking TTL, 'readonly' is fine.
        const transaction = db.transaction([storeName], 'readonly');
  
        transaction.onerror = (event) => {
          console.error('Transaction error:', event.target.error);
          db.close(); // Ensure db is closed on transaction error
          reject(new Error('Transaction failed'));
        };
  
        transaction.oncomplete = () => {
          db.close(); // Close the database connection when the transaction is done
        };
  
        // 3. Get the object store
        if (!db.objectStoreNames.contains(storeName)) {
          console.error(`Object store '${storeName}' does not exist in database '${dbName}' at version ${db.version}.`);
          db.close();
          reject(new Error(`Object store '${storeName}' not found.`));
          return;
        }
        const objectStore = transaction.objectStore(storeName);
  
        try {
          // Use promises to await the results of both get requests
          const getDataRequest = objectStore.get(key);
          const getTTLRequest = objectStore.get("TTL_" + key);
  
          const [data, ttl] = await Promise.all([
            new Promise((res, rej) => {
              getDataRequest.onsuccess = (e) => res(e.target.result);
              getDataRequest.onerror = (e) => rej(e.target.error);
            }),
            new Promise((res, rej) => {
              getTTLRequest.onsuccess = (e) => res(e.target.result);
              getTTLRequest.onerror = (e) => rej(e.target.error);
            })
          ]);
  
          const currentTimeMillis = Date.now();
  
          // Checking if data exists AND if TTL is valid (or if no TTL is set, assume valid)
          // If 'ttl' is undefined (no TTL record), treat it as always valid.
          // If 'ttl' is a number, compare it.
          if (data !== undefined && (ttl === undefined || ttl >= currentTimeMillis)) {
            resolve(data);
          } else {
            // If data is undefined, or TTL is defined and expired
            if (data !== undefined && ttl !== undefined && ttl < currentTimeMillis) {
              console.log(`Cache for key '${key}' has expired. Current: ${currentTimeMillis}, TTL: ${ttl}`);
              // Optional: Consider deleting the expired item here
              // This would require a 'readwrite' transaction.
              // await deleteExpiredItem(dbName, dbVersion, storeName, key);
            }
            resolve(null); // Key not found or cache has expired
          }
        } catch (error) {
          console.error('Error in IndexedDB operations:', error);
          reject(new Error('Error retrieving data or TTL from IndexedDB.'));
        }
        // Note: db.close() is handled by transaction.oncomplete, or by error handlers
      };
    });
  };


const addObjectInObjectStore = (dbName, dbVersion, objectStoreName, objectToAdd) => {
    return new Promise((resolve, reject) => {
        console.log(`Attempting to open database "${dbName}" (version ${dbVersion}) to add object to "${objectStoreName}".`);

        // 1. Open the database connection.
        const request = window.indexedDB.open(dbName, dbVersion);

        let db; // Variable to hold the database connection object.

        // 2. Handle database open errors.
        request.onerror = (event) => {
            console.error(`Error opening database "${dbName}":`, event.target.error);
            reject(event.target.error);
        };
                
        // 3. Handle successful database open.
        request.onsuccess = (event) => {
            db = event.target.result;
            console.log(`Database "${dbName}" successfully opened at version ${db.version}.`);

            // Check if the object store exists. If not, the transaction will fail.
            if (!db.objectStoreNames.contains(objectStoreName)) {
                db.close();
                const error = new Error(`Object store "${objectStoreName}" does not exist in the database. Please create the schema first.`);
                console.error(error.message);
                return reject(error);
            }

            try {
                // 4. Create a read-write transaction.
                const transaction = db.transaction([objectStoreName], 'readwrite');

                // 5. Handle transaction errors.
                transaction.onerror = (event) => {
                    console.error(`Transaction error for "${objectStoreName}":`, event.target.error);
                    db.close(); // Ensure the connection is closed on error.
                    reject(event.target.error);
                };

                // 6. Handle transaction completion.
                transaction.oncomplete = () => {
                    // Closing the database connection.
                    db.close();
                    console.log(`Transaction complete and connection for "${dbName}" closed.`);
                };

                // 7. Get the object store and perform the put request.
                const objectStore = transaction.objectStore(objectStoreName);
                const putRequest = objectStore.put(objectToAdd);

                // 8. Handle the success of the individual put request.
                putRequest.onsuccess = (event) => {
                    // Resolve the Promise with the key of the added object.
                    // The transaction.oncomplete will handle the closing of the database.
                    resolve(event.target.result);
                };

                // 9. Handle errors on the individual put request.
                putRequest.onerror = (event) => {
                    // The transaction's onerror will also fire, which is a good place to handle it.
                    console.error(`Error adding object to "${objectStoreName}":`, event.target.error);
                };
            } catch (e) {
                // Catch any synchronous errors, like a missing object store name.
                db.close();
                reject(e);
            }
        };

        // 10. Handle blocked connections.
        request.onblocked = () => {
            const errorMessage = `Database "${dbName}" open request is blocked. Please close all other connections or tabs using this database.`;
            console.warn(errorMessage);
            reject(new Error(errorMessage));
        };
    });
};

const putObjectInObjectStoreByKey = async (dbName, dbVersion, objectStoreName, key, ttlInSeconds, data) => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, dbVersion);
  
      request.onerror = (event) => {
        console.error(`Error opening database '${dbName}' (version ${dbVersion}):`, event.target.errorCode, event.target.error);
        reject(new Error(`Failed to open database: ${event.target.error}`));
      };
  
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const transaction = event.target.transaction;
  
        if (event.oldVersion === 0) {
          console.error(`Database '${dbName}' does not exist. Cannot put data into object store '${objectStoreName}'.`);
          transaction.abort();
          db.close();
          reject(new Error(`Database '${dbName}' not found.`));
          return;
        } else if (event.newVersion !== dbVersion) {
          console.error(`Database '${dbName}' is upgrading to version ${event.newVersion}, but requested ${dbVersion}. Version mismatch.`);
          transaction.abort();
          db.close();
          reject(new Error(`Database '${dbName}' found but attempting upgrade to wrong version. Expected ${dbVersion}, upgrading to ${event.newVersion}.`));
          return;
        } else {
          console.log(`Database '${dbName}' upgrading from version ${event.oldVersion} to ${event.newVersion}.`);
          if (!db.objectStoreNames.contains(objectStoreName)) {
              console.error(`Object store '${objectStoreName}' not found in database '${dbName}' after upgrade to version ${dbVersion}.`);
              transaction.abort();
              db.close();
              reject(new Error(`Object store '${objectStoreName}' not found for version ${dbVersion} after upgrade.`));
              return;
          }
        }
      };
  
      request.onsuccess = (event) => {
        const db = event.target.result;
  
        if (db.version !== dbVersion) {
          console.error(`Database '${dbName}' opened at version ${db.version}, but requested version ${dbVersion}. Version mismatch.`);
          db.close();
          reject(new Error(`Database '${dbName}' found but at wrong version. Expected ${dbVersion}, got ${db.version}.`));
          return;
        }
  
        if (!db.objectStoreNames.contains(objectStoreName)) {
          console.error(`Object store '${objectStoreName}' does not exist in database '${dbName}' at version ${db.version}.`);
          db.close();
          reject(new Error(`Object store '${objectStoreName}' not found in database '${dbName}'.`));
          return;
        }
  
        const transaction = db.transaction([objectStoreName], 'readwrite');
  
        transaction.onerror = (event) => {
          console.error(`Transaction error while putting data into '${objectStoreName}':`, event.target.error);
          db.close();
          reject(new Error(`Transaction failed: ${event.target.error}`));
        };
  
        transaction.oncomplete = () => {
          // This will only fire if ALL requests within the transaction completed successfully.
          console.log(`Both data and TTL successfully put into object store '${objectStoreName}' in database '${dbName}'.`);
          db.close();
          resolve();
        };
  
        const objectStore = transaction.objectStore(objectStoreName);
  
        // --- Main Data Put ---
        const putRequest = objectStore.put(data, key);
        putRequest.onerror = (event) => {
          console.error(`Error putting data for key '${key}':`, event.target.error);
          // Important: Abort the transaction if a specific request fails,
          // unless you have a robust way to continue (which is rare).
          // Aborting here will cause transaction.onerror to fire.
          transaction.abort();
        };
  
        // --- TTL Data Put ---
        const ttlKey = "TTL_" + key; // Using "TTL_" prefix for clarity
        const ttlExpirationTime = Date.now() + ttlInSeconds * 1000; // TTL in milliseconds from current time
        const putTTLRequest = objectStore.put(ttlExpirationTime, ttlKey);
  
        putTTLRequest.onerror = (event) => {
          console.error(`Error putting TTL data for key '${ttlKey}':`, event.target.error);
          transaction.abort(); // Abort if TTL put fails
        };
  
        // No onsuccess needed for put requests; transaction.oncomplete is the overall success indicator.
      };
    });
  };

const createDatabaseWithObjectStores = async (dbName, dbVersion, arrayNames) => {
    return new Promise((resolve, reject) => {
        console.log(`Attempting to open/create database: "${dbName}" at version ${dbVersion}`);

        const request = window.indexedDB.open(dbName, dbVersion);
        let db; 

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            console.log(`onupgradeneeded triggered. Old version: ${event.oldVersion}, New version: ${event.newVersion}.`);

            // Ensure arrayNames is an array and iterate through it
            if (Array.isArray(arrayNames)) {
                arrayNames.forEach(storeName => {
                    if (storeName && !db.objectStoreNames.contains(storeName)) {
                        // Create the object store with 'id' as the keyPath and autoIncrement as true
                        db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
                        console.log(`Object store "${storeName}" created.`);
                    } else if (storeName) {
                        console.log(`Object store "${storeName}" already exists.`);
                    }
                });
            } else {
                console.warn('arrayNames parameter is not an array or is empty. No object stores will be created.');
            }
        };

        // This event fires when the database is successfully opened (or upgraded and then opened).
        request.onsuccess = (event) => {
            db = event.target.result;
            console.log(`Database "${dbName}" successfully opened at version ${db.version}.`);
            // Resolve the Promise with the database object so it can be used for transactions.
            resolve(db);

            // Closing the database
            db.close();
            console.log(`Database connection for "${dbName}" closed.`);
        };

        // This event fires if there's an error opening the database.
        request.onerror = (event) => {
            console.error(`Error opening database "${dbName}":`, event.target.error);
            reject(event.target.error);
        };

        // This event fires if another tab/window has an older version of the database open
        // and is blocking the current upgrade/open request.
        request.onblocked = () => {
            const errorMessage = `Database "${dbName}" open request is blocked. Please close all other connections or tabs using this database.`;
            console.warn(errorMessage);
            reject(new Error(errorMessage));
        };
    });
};

const clearObjectStore = async (dbName, dbVersion, objectStoreName) => {
    return new Promise((resolve, reject) => {
      // 1. Open the database connection at the specified version
      const request = indexedDB.open(dbName, dbVersion);
  
      request.onerror = (event) => {
        console.error(`Error opening database '${dbName}' (version ${dbVersion}):`, event.target.errorCode, event.target.error);
        reject(new Error(`Failed to open database: ${event.target.error}`));
      };
  
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (event.oldVersion === 0) {
          console.error(`Database '${dbName}' does not exist. Cannot clear object store '${objectStoreName}'.`);
          // Abort the transaction to prevent database creation
          event.target.transaction.abort();
          db.close(); // Close the connection opened by this new creation attempt
          reject(new Error(`Database '${dbName}' not found.`));
          return; // Stop further execution in this handler
        } else {
          // Database exists, but the requested version is higher than the current stored version.
          console.log(`Database '${dbName}' upgrade needed from version ${event.oldVersion} to ${event.newVersion}.`);
          if (!db.objectStoreNames.contains(objectStoreName)) {
              console.error(`Object store '${objectStoreName}' not found after upgrade to version ${dbVersion}.`);
              event.target.transaction.abort();
              db.close();
              reject(new Error(`Object store '${objectStoreName}' not found for version ${dbVersion}.`));
              return;
          }
        }
      };
  
      request.onsuccess = (event) => {
        const db = event.target.result;
  
        // Checking for matching database version
        if (db.version !== dbVersion) {
          console.error(`Database '${dbName}' opened at version ${db.version}, but requested version ${dbVersion}. Version mismatch.`);
          db.close();
          reject(new Error(`Database '${dbName}' found but at wrong version. Expected ${dbVersion}, got ${db.version}.`));
          return;
        }
  
        // Ensuring the object store exists in the database
        if (!db.objectStoreNames.contains(objectStoreName)) {
          console.error(`Object store '${objectStoreName}' does not exist in database '${dbName}' at version ${db.version}.`);
          db.close();
          reject(new Error(`Object store '${objectStoreName}' not found in database '${dbName}'.`));
          return;
        }
  
        // 2. Starting a readwrite transaction
        const transaction = db.transaction([objectStoreName], 'readwrite');
  
        transaction.onerror = (event) => {
          console.error(`Transaction error while clearing '${objectStoreName}':`, event.target.error);
          db.close();
          reject(new Error(`Transaction failed: ${event.target.error}`));
        };
  
        transaction.oncomplete = () => {
          console.log(`Object store '${objectStoreName}' in database '${dbName}' cleared successfully.`);
          db.close(); 
          resolve();
        };
  
        // 3. Getting the object store and call clear()
        const objectStore = transaction.objectStore(objectStoreName);
        const clearRequest = objectStore.clear();
  
        clearRequest.onerror = (event) => {
          console.error(`Error during clear operation for '${objectStoreName}':`, event.target.error);
        };
      };
    });
  };

const deleteDatabase = async (dbName) => {
    // Wrap the IndexedDB delete operation in a Promise to use with async/await.
    return new Promise((resolve, reject) => {
        console.log(`Attempting to delete database: "${dbName}"`);

        // Request to delete the database.
        const request = window.indexedDB.deleteDatabase(dbName);

        // Event handler for successful deletion.
        request.onsuccess = () => {
            console.log(`Database "${dbName}" successfully deleted.`);
            resolve(); // Resolve the Promise on success.
        };

        // Event handler for errors during deletion.
        request.onerror = (event) => {
            const error = event.target.error;
            console.error(`Error deleting database "${dbName}":`, error);
            reject(error); // Reject the Promise with the error.
        };

        // Event handler if the deletion is blocked by open connections.
        request.onblocked = () => {
            const errorMessage = `Deletion of database "${dbName}" is blocked. Please close all open connections to this database (e.g., other browser tabs).`;
            console.warn(errorMessage);
            reject(new Error(errorMessage)); // Reject with a specific error for blocked state.
        };
    });
};



const indexedDBService = {
    getObjectStore,
    getValueByObjectStoreByKey,     //new
    addObjectInObjectStore,
    putObjectInObjectStoreByKey,    //new
    createDatabaseWithObjectStores,
    clearObjectStore,               //new
    deleteDatabase
};

export default indexedDBService;