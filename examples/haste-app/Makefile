all: haste-app haste-app.js

haste-app.js: haste-app.hs
	hastec haste-app.hs

haste-app:
	cabal sandbox init --sandbox=../../.cabal-sandbox
	cabal install

clean:
	-cabal clean
	-rm -r main
	-rm *~
	-rm haste-app.hi
	-rm haste-app.o

distclean: clean
	-rm haste-app
	-rm haste-app.js
