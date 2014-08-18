-- | haste-inst - Haste wrapper for cabal.
module Main where
import System.Environment
import Haste.Environment
import Control.Shell
import Data.List

type Match = (String -> Bool, [String] -> [String])

cabal :: [String] -> IO ()
cabal args = do
  let fullargs = [] ++ hasteargs ++ args
  putStrLn "====================================================="
  putStrLn $ "==> [haste-inst] run cabal " ++ (show $ fullargs)
  _ <- shell $ run_ "cabal" fullargs ""
  putStrLn "====================================================="
  return ()
  where
    hasteargs
      | "build" `elem` args =
        ["--with-ghc=" ++ hasteBinary]
      | otherwise =
        ["--with-compiler=" ++ hasteBinary,
         "--with-hc-pkg=" ++ hastePkgBinary,
         "--with-hsc2hs=hsc2hs",
         "--prefix=" ++ hasteInstDir,
         "--package-db=" ++ pkgDir,
         "-fhaste-inst"]

main :: IO ()
main = do
  as <- getArgs
  as <- return $ if "--install-jsmods" `elem` as || not ("build" `elem` as)
                   then libinstall : filter (/= "--install-jsmods") as
                   else as
  as <- return $ if "--unbooted" `elem` as
                   then unbooted : filter (/= "--unbooted") as
                   else as
  cabal as
  where
    libinstall = "--ghc-option=--libinstall"
    unbooted   = "--ghc-option=--unbooted"
